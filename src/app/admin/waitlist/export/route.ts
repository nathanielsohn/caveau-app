import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// RFC 4180 escape: wrap in quotes if the value contains quote, comma, or
// newline; double up any embedded quotes. Also strips leading characters
// (=, +, -, @) that Excel interprets as formulas — CSV injection defense.
function csvCell(raw: string | Date | boolean | null | undefined): string {
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

export async function GET() {
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

  const entries = await prisma.waitlist.findMany({
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "name",
    "email",
    "phone",
    "source",
    "referred_by",
    "loi_signed",
    "loi_signed_at",
    "notes",
    "created_at",
  ];

  const rows = entries.map((e) =>
    [
      csvCell(e.name),
      csvCell(e.email),
      csvCell(e.phone),
      csvCell(e.source),
      csvCell(e.referredBy),
      csvCell(e.loiSigned),
      csvCell(e.loiSignedAt),
      csvCell(e.notes),
      csvCell(e.createdAt),
    ].join(","),
  );

  const body = [header.join(","), ...rows].join("\r\n") + "\r\n";

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="caveau-waitlist-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
