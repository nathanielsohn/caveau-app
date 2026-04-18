import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// Mirror of src/app/admin/waitlist/export/route.ts — kept inline instead of
// shared so the CSV logic stays one-file-per-endpoint.
function csvCell(
  raw: string | Date | boolean | number | null | undefined,
): string {
  if (raw == null) return "";
  let value =
    raw instanceof Date
      ? raw.toISOString()
      : typeof raw === "boolean"
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
  if (session.user.role !== Role.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const idCheck = UuidSchema.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const event = await prisma.event.findUnique({
    where: { id: idCheck.data },
    include: {
      rsvps: {
        include: {
          member: { select: { name: true, email: true, tier: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      signups: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header = [
    "source",
    "name",
    "email",
    "tier",
    "seats",
    "phone",
    "notes",
    "cancelled_at",
    "submitted_at",
  ];

  const rows: string[] = [];
  for (const r of event.rsvps) {
    rows.push(
      [
        csvCell("rsvp"),
        csvCell(r.member.name),
        csvCell(r.member.email),
        csvCell(r.member.tier),
        csvCell(r.seats),
        csvCell(null),
        csvCell(r.notes),
        csvCell(r.cancelledAt),
        csvCell(r.createdAt),
      ].join(","),
    );
  }
  for (const s of event.signups) {
    rows.push(
      [
        csvCell("signup"),
        csvCell(s.name),
        csvCell(s.email),
        csvCell(null),
        csvCell(null),
        csvCell(s.phone),
        csvCell(s.notes),
        csvCell(null),
        csvCell(s.createdAt),
      ].join(","),
    );
  }

  const body = [header.join(","), ...rows].join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `caveau-event-${event.slug}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
