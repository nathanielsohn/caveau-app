import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  computeMargin,
  formatAcquisitionSpec,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/acquisitions";
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

  const acquisitions = await prisma.acquisition.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      member: { select: { name: true, email: true, tier: true } },
    },
  });

  const header = [
    "created_at",
    "member_name",
    "member_email",
    "member_tier",
    "status",
    "request_spec",
    "quantity",
    "max_budget_usd",
    "source",
    "estimated_total_usd",
    "actual_cost_usd",
    "member_price_usd",
    "margin_usd",
    "margin_pct",
    "fulfilled_at",
    "declined_at",
    "cancelled_at",
  ];

  const rows = acquisitions.map((a) => {
    const cost = a.actualCostUsd ? toNumber(a.actualCostUsd) : null;
    const price = a.memberPriceUsd ? toNumber(a.memberPriceUsd) : null;
    const margin =
      cost != null && price != null
        ? computeMargin({ actualCostUsd: cost, memberPriceUsd: price })
        : null;
    return [
      csvCell(a.createdAt),
      csvCell(a.member.name),
      csvCell(a.member.email),
      csvCell(a.member.tier),
      csvCell(STATUS_LABELS[a.status]),
      csvCell(formatAcquisitionSpec(a)),
      csvCell(a.quantity),
      csvCell(a.maxBudgetUsd ? toNumber(a.maxBudgetUsd).toFixed(2) : null),
      csvCell(a.source ? SOURCE_LABELS[a.source] : null),
      csvCell(
        a.estimatedTotalUsd
          ? toNumber(a.estimatedTotalUsd).toFixed(2)
          : null,
      ),
      csvCell(cost?.toFixed(2) ?? null),
      csvCell(price?.toFixed(2) ?? null),
      csvCell(margin ? margin.marginUsd.toFixed(2) : null),
      csvCell(
        margin && margin.marginPct != null
          ? margin.marginPct.toFixed(2)
          : null,
      ),
      csvCell(a.fulfilledAt),
      csvCell(a.declinedAt),
      csvCell(a.cancelledAt),
    ];
  });

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="acquisitions-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
