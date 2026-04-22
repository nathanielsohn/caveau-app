import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search } from "lucide-react";
import { AcquisitionStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { Role } from "@prisma/client";
import {
  computeMargin,
  formatAcquisitionSpec,
  STATUS_LABELS,
} from "@/lib/acquisitions";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Filter = "open" | "fulfilled" | "cancelled" | "declined" | "all";

const STATUS_FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<AcquisitionStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  sourcing: "bg-ok/10 text-ok border-ok/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

function resolveFilter(raw: string | undefined): Filter {
  if (!raw) return "open";
  if (
    raw === "open" ||
    raw === "fulfilled" ||
    raw === "declined" ||
    raw === "cancelled" ||
    raw === "all"
  )
    return raw;
  return "open";
}

function whereFor(filter: Filter): Prisma.AcquisitionWhereInput {
  switch (filter) {
    case "open":
      return {
        status: {
          in: [AcquisitionStatus.requested, AcquisitionStatus.sourcing],
        },
      };
    case "fulfilled":
      return { status: AcquisitionStatus.fulfilled };
    case "declined":
      return { status: AcquisitionStatus.declined };
    case "cancelled":
      return { status: AcquisitionStatus.cancelled };
    case "all":
      return {};
  }
}

export default async function AdminAcquisitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const params = await searchParams;
  const filter = resolveFilter(params.status);

  const [acquisitions, counts] = await Promise.all([
    prisma.acquisition.findMany({
      where: whereFor(filter),
      orderBy: { createdAt: "desc" },
      include: {
        member: { select: { name: true, email: true, tier: true } },
      },
      take: 200,
    }),
    prisma.acquisition.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<AcquisitionStatus, number>();
  for (const c of counts) byStatus.set(c.status, c._count._all);
  const openCount =
    (byStatus.get(AcquisitionStatus.requested) ?? 0) +
    (byStatus.get(AcquisitionStatus.sourcing) ?? 0);
  const totalAll = counts.reduce((sum, c) => sum + c._count._all, 0);

  function countFor(f: Filter): number {
    if (f === "open") return openCount;
    if (f === "all") return totalAll;
    if (f === "fulfilled")
      return byStatus.get(AcquisitionStatus.fulfilled) ?? 0;
    if (f === "declined")
      return byStatus.get(AcquisitionStatus.declined) ?? 0;
    return byStatus.get(AcquisitionStatus.cancelled) ?? 0;
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Search className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Acquisitions</h1>
            <p className="text-sm text-muted">
              Member-requested sourcing queue.
            </p>
          </div>
        </div>
        <a
          href="/admin/acquisitions/export"
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
              href={`/admin/acquisitions?status=${f.value}`}
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

      {acquisitions.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            Nothing to show for this filter.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Member</th>
                <th className="text-left px-4 py-3 font-medium">Request</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Qty</th>
                <th className="text-left px-4 py-3 font-medium">Quote</th>
                <th className="text-left px-4 py-3 font-medium">Margin</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {acquisitions.map((a) => {
                const cost = a.actualCostUsd ? toNumber(a.actualCostUsd) : null;
                const price = a.memberPriceUsd
                  ? toNumber(a.memberPriceUsd)
                  : null;
                const margin =
                  cost != null && price != null
                    ? computeMargin({
                        actualCostUsd: cost,
                        memberPriceUsd: price,
                      })
                    : null;
                const quoteDisplay = price
                  ? formatCurrency(price)
                  : a.estimatedTotalUsd
                    ? `~${formatCurrency(toNumber(a.estimatedTotalUsd))}`
                    : "—";
                return (
                  <tr
                    key={a.id}
                    className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/acquisitions/${a.id}`}
                        className="text-primary hover:text-gold transition-colors"
                      >
                        {a.member.name}
                      </Link>
                      <p className="text-[11px] text-muted truncate max-w-[180px]">
                        {a.member.email}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      <Link
                        href={`/admin/acquisitions/${a.id}`}
                        className="hover:text-primary"
                      >
                        {formatAcquisitionSpec(a)}
                      </Link>
                      {a.maxBudgetUsd && (
                        <p className="text-[11px] text-muted mt-0.5">
                          Cap {formatCurrency(toNumber(a.maxBudgetUsd))}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[a.status]}`}
                      >
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {a.quantity}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {quoteDisplay}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {margin && margin.marginPct != null ? (
                        <span
                          className={
                            margin.withinTargetBand
                              ? "text-ok"
                              : "text-danger"
                          }
                        >
                          {formatCurrency(margin.marginUsd)} ·{" "}
                          {margin.marginPct.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-secondary whitespace-nowrap">
                      {formatDate(a.createdAt)}
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
