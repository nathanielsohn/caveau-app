import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";
import { CAVEAU_FIELDS, type ColumnMapping } from "@/lib/migration-mapping";

export const dynamic = "force-dynamic";

// Mirror of src/app/admin/events/[id]/export/route.ts — inline instead of
// shared so CSV logic stays one-file-per-endpoint.
function csvCell(
  raw: string | number | boolean | null | undefined,
): string {
  if (raw == null) return "";
  let value =
    typeof raw === "boolean"
      ? raw
        ? "true"
        : "false"
      : String(raw);

  if (/^[=+\-@]/.test(value)) {
    value = `'${value}`;
  }
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.admin &&
    session.user.role !== Role.staff
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const migration = await prisma.migrationRequest.findUnique({
    where: { id: idCheck.data },
    include: {
      member: { select: { name: true, email: true } },
    },
  });
  if (!migration) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mapping = (migration.columnMapping as ColumnMapping) ?? {};
  const rows = (migration.rows as Record<string, string>[]) ?? [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];

  // Line 1: Caveau field assignments per source header, as an Excel-safe
  // comment row. Lets staff eyeball the mapping without opening the app.
  const mappingRow = headers.map((h) => {
    const caveauField = CAVEAU_FIELDS.find((f) => mapping[f] === h);
    return csvCell(caveauField ? `caveau:${caveauField}` : "");
  });

  const headerRow = headers.map((h) => csvCell(h));
  const dataRows = rows.map((row) =>
    headers.map((h) => csvCell(row[h] ?? "")).join(","),
  );

  const body =
    [mappingRow.join(","), headerRow.join(","), ...dataRows].join("\r\n") +
    "\r\n";

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = migration.member.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "member";
  const filename = `caveau-migration-${slug}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
