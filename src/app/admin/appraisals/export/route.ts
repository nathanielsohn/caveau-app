import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { BASIS_LABELS, PURPOSE_LABELS, STATUS_LABELS } from "@/lib/appraisals";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

function csvCell(
  raw: string | number | Date | boolean | null | undefined,
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

  if (/^[=+\-@]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== Role.admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appraisals = await prisma.appraisal.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      member: { select: { name: true, email: true, tier: true } },
    },
  });

  const header = [
    "appraisal_number",
    "member_name",
    "member_email",
    "member_tier",
    "status",
    "purpose",
    "basis",
    "is_welcome_appraisal",
    "bottle_count",
    "total_basis_usd",
    "price_charged_usd",
    "effective_date",
    "created_at",
    "completed_at",
    "revoked_at",
  ];

  const rows = appraisals.map((a) => [
    csvCell(a.appraisalNumber),
    csvCell(a.member.name),
    csvCell(a.member.email),
    csvCell(a.member.tier),
    csvCell(STATUS_LABELS[a.status]),
    csvCell(PURPOSE_LABELS[a.purpose]),
    csvCell(BASIS_LABELS[a.basis]),
    csvCell(a.isWelcomeAppraisal),
    csvCell(a.bottleCount),
    csvCell(a.totalBasisUsd ? toNumber(a.totalBasisUsd).toFixed(2) : null),
    csvCell(
      a.priceChargedUsd ? toNumber(a.priceChargedUsd).toFixed(2) : null,
    ),
    csvCell(a.effectiveDate),
    csvCell(a.createdAt),
    csvCell(a.completedAt),
    csvCell(a.revokedAt),
  ]);

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="appraisals-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
