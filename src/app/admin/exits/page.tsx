import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Target } from "lucide-react";
import { ExitStatus, Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  computeCommission,
  formatChannelWithHouse,
  STATUS_LABELS,
} from "@/lib/exits";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Filter = "open" | "sold" | "withdrawn" | "cancelled" | "all";

const STATUS_FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "sold", label: "Sold" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<ExitStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  listed: "bg-ok/10 text-ok border-ok/30",
  sold: "bg-ok/10 text-ok border-ok/30",
  withdrawn: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

function resolveFilter(raw: string | undefined): Filter {
  if (!raw) return "open";
  if (
    raw === "open" ||
    raw === "sold" ||
    raw === "withdrawn" ||
    raw === "cancelled" ||
    raw === "all"
  )
    return raw;
  return "open";
}

function whereFor(filter: Filter): Prisma.ExitFacilitationWhereInput {
  switch (filter) {
    case "open":
      return { status: { in: [ExitStatus.requested, ExitStatus.listed] } };
    case "sold":
      return { status: ExitStatus.sold };
    case "withdrawn":
      return { status: ExitStatus.withdrawn };
    case "cancelled":
      return { status: ExitStatus.cancelled };
    case "all":
      return {};
  }
}

export default async function AdminExitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const params = await searchParams;
  const filter = resolveFilter(params.status);

  const [exits, counts] = await Promise.all([
    prisma.exitFacilitation.findMany({
      where: whereFor(filter),
      orderBy: { createdAt: "desc" },
      include: {
        member: { select: { name: true, email: true, tier: true } },
        wine: { select: { name: true, producer: true, vintage: true } },
      },
      take: 200,
    }),
    prisma.exitFacilitation.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<ExitStatus, number>();
  for (const c of counts) byStatus.set(c.status, c._count._all);
  const openCount =
    (byStatus.get(ExitStatus.requested) ?? 0) +
    (byStatus.get(ExitStatus.listed) ?? 0);
  const totalAll = counts.reduce((sum, c) => sum + c._count._all, 0);

  function countFor(f: Filter): number {
    if (f === "open") return openCount;
    if (f === "all") return totalAll;
    if (f === "sold") return byStatus.get(ExitStatus.sold) ?? 0;
    if (f === "withdrawn") return byStatus.get(ExitStatus.withdrawn) ?? 0;
    return byStatus.get(ExitStatus.cancelled) ?? 0;
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Target className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Exits</h1>
            <p className="text-sm text-muted">
              Member consignment queue.
            </p>
          </div>
        </div>
        <a
          href="/admin/exits/export"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count = countFor(f.value);
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/admin/exits?status=${f.value}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                active
                  ? "bg-gold/10 border-gold/40 text-gold"
                  : "border-[#2A2A30] text-secondary hover:text-primary hover:border-[#2A2A30]/80"
              }`}
            >
              {f.label}
              <span
                className={`text-[10px] ${active ? "text-gold" : "text-muted"}`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {exits.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            Nothing to show for this filter.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Member</th>
                <th className="text-left px-4 py-3 font-medium">Bottle</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Channel</th>
                <th className="text-left px-4 py-3 font-medium">Gross</th>
                <th className="text-left px-4 py-3 font-medium">Commission</th>
                <th className="text-left px-4 py-3 font-medium">Net</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {exits.map((e) => {
                const gross = e.grossProceedsUsd
                  ? toNumber(e.grossProceedsUsd)
                  : null;
                const pct = e.commissionPct ? toNumber(e.commissionPct) : null;
                const commission =
                  gross != null && pct != null
                    ? computeCommission({
                        grossProceedsUsd: gross,
                        commissionPct: pct,
                      })
                    : null;
                const listed = e.listedPriceUsd
                  ? toNumber(e.listedPriceUsd)
                  : null;
                return (
                  <tr
                    key={e.id}
                    className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/exits/${e.id}`}
                        className="text-primary hover:text-gold transition-colors"
                      >
                        {e.member.name}
                      </Link>
                      <p className="text-[11px] text-muted truncate max-w-[180px]">
                        {e.member.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      <Link
                        href={`/admin/exits/${e.id}`}
                        className="hover:text-primary"
                      >
                        {e.wine.vintage} {e.wine.producer} — {e.wine.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[e.status]}`}
                      >
                        {STATUS_LABELS[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {formatChannelWithHouse({
                        channel: e.channel,
                        auctionHouseName: e.auctionHouseName,
                      })}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {gross != null
                        ? formatCurrency(gross)
                        : listed != null
                          ? `~${formatCurrency(listed)}`
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {commission && pct != null ? (
                        <span
                          className={
                            commission.withinTargetBand ||
                            pct === 0
                              ? "text-ok"
                              : "text-danger"
                          }
                        >
                          {formatCurrency(commission.commissionUsd)} ·{" "}
                          {pct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {commission
                        ? formatCurrency(commission.netProceedsUsd)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {formatDate(e.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
