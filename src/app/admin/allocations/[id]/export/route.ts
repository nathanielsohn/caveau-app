import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

// Mirrors the csvCell helper in src/app/admin/events/[id]/export/route.ts —
// kept inline rather than shared so CSV logic stays one-file-per-endpoint.
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

  const allocation = await prisma.allocation.findUnique({
    where: { id: idCheck.data },
    include: {
      requests: {
        include: {
          member: {
            select: {
              name: true,
              email: true,
              tier: true,
              foundingMember: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!allocation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const header = [
    "name",
    "email",
    "tier",
    "founding_member",
    "quantity_requested",
    "status",
    "member_note",
    "staff_note",
    "submitted_at",
    "accepted_at",
    "fulfilled_at",
    "declined_at",
    "cancelled_at",
  ];

  const rows: string[] = [];
  for (const r of allocation.requests) {
    rows.push(
      [
        csvCell(r.member.name),
        csvCell(r.member.email),
        csvCell(r.member.tier),
        csvCell(r.member.foundingMember),
        csvCell(r.quantityRequested),
        csvCell(r.status),
        csvCell(r.memberNote),
        csvCell(r.staffNote),
        csvCell(r.createdAt),
        csvCell(r.acceptedAt),
        csvCell(r.fulfilledAt),
        csvCell(r.declinedAt),
        csvCell(r.cancelledAt),
      ].join(","),
    );
  }

  const body = [header.join(","), ...rows].join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `caveau-allocation-${allocation.slug}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
