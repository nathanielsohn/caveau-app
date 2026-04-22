import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  CHANNEL_LABELS,
  formatChannelWithHouse,
  STATUS_LABELS,
} from "@/lib/exits";
import { toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Admin-only CSV export with commission fields. Matches the
 * `/admin/acquisitions/export` shape and cell-escaping rules so a
 * downstream pipeline that consumes both queues doesn't need parallel
 * parsers.
 *
 * Commission fields (commissionPct, commissionUsd, netProceedsUsd)
 * surface here — they never appear on member routes or in the AI
 * Advisor tool output. That boundary is the whole reason we need a
 * separate export instead of joining `/exits` + public data.
 */
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

  // Escape leading =/+/-/@ so downstream Excel users don't auto-evaluate
  // a cell that looks like a formula — same guard as
  // /admin/acquisitions/export.
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

  const exits = await prisma.exitFacilitation.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: {
      member: { select: { name: true, email: true, tier: true } },
      wine: { select: { name: true, producer: true, vintage: true } },
    },
  });

  const header = [
    "created_at",
    "member_name",
    "member_email",
    "member_tier",
    "status",
    "wine",
    "channel",
    "auction_house",
    "listed_price_usd",
    "gross_proceeds_usd",
    "commission_pct",
    "commission_usd",
    "net_proceeds_usd",
    "target_price_low_usd",
    "target_price_high_usd",
    "listed_at",
    "sold_at",
    "withdrawn_at",
    "withdrawn_reason",
    "cancelled_at",
  ];

  const rows = exits.map((e) => [
    csvCell(e.createdAt),
    csvCell(e.member.name),
    csvCell(e.member.email),
    csvCell(e.member.tier),
    csvCell(STATUS_LABELS[e.status]),
    csvCell(`${e.wine.vintage} ${e.wine.producer} — ${e.wine.name}`),
    csvCell(e.channel ? CHANNEL_LABELS[e.channel] : null),
    csvCell(
      e.channel
        ? formatChannelWithHouse({
            channel: e.channel,
            auctionHouseName: e.auctionHouseName,
          })
        : null,
    ),
    csvCell(e.listedPriceUsd ? toNumber(e.listedPriceUsd).toFixed(2) : null),
    csvCell(
      e.grossProceedsUsd ? toNumber(e.grossProceedsUsd).toFixed(2) : null,
    ),
    csvCell(e.commissionPct ? toNumber(e.commissionPct).toFixed(2) : null),
    csvCell(e.commissionUsd ? toNumber(e.commissionUsd).toFixed(2) : null),
    csvCell(e.netProceedsUsd ? toNumber(e.netProceedsUsd).toFixed(2) : null),
    csvCell(e.targetPriceLow ? toNumber(e.targetPriceLow).toFixed(2) : null),
    csvCell(
      e.targetPriceHigh ? toNumber(e.targetPriceHigh).toFixed(2) : null,
    ),
    csvCell(e.listedAt),
    csvCell(e.soldAt),
    csvCell(e.withdrawnAt),
    csvCell(e.withdrawnReason),
    csvCell(e.cancelledAt),
  ]);

  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="exits-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
