import Link from "next/link";
import { redirect } from "next/navigation";
import { Gem, Plus } from "lucide-react";
import {
  AllocationStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: "all" | AllocationStatus; label: string }[] = [
  { value: "draft", label: "Drafts" },
  { value: "published", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<AllocationStatus, string> = {
  draft: "bg-muted/10 text-muted border-muted/20",
  published: "bg-ok/10 text-ok border-ok/30",
  closed: "bg-gold/10 text-gold border-gold/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-danger/10 text-danger border-danger/30",
};

const STATUS_LABELS: Record<AllocationStatus, string> = {
  draft: "Draft",
  published: "Open",
  closed: "Closed",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

function resolveStatusFilter(
  raw: string | undefined,
): "all" | AllocationStatus {
  if (!raw) return "published";
  if (raw === "all") return "all";
  if (
    raw === "draft" ||
    raw === "published" ||
    raw === "closed" ||
    raw === "fulfilled" ||
    raw === "cancelled"
  ) {
    return raw;
  }
  return "published";
}

export default async function AdminAllocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const params = await searchParams;
  const filter = resolveStatusFilter(params.status);

  const where: Prisma.AllocationWhereInput =
    filter === "all" ? {} : { status: filter };

  const [allocations, counts] = await Promise.all([
    prisma.allocation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { requests: true } },
      },
      take: 200,
    }),
    prisma.allocation.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = new Map<AllocationStatus, number>();
  for (const c of counts) byStatus.set(c.status, c._count._all);
  const totalAll = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Gem className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">Allocations</h1>
            <p className="text-sm text-muted">
              Private releases and limited allocations.
            </p>
          </div>
        </div>
        <Link
          href="/admin/allocations/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New allocation
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? totalAll
              : (byStatus.get(f.value) ?? 0);
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/admin/allocations?status=${f.value}`}
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

      {allocations.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            Nothing to show for this filter yet.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-[#2A2A30]/50 text-xs uppercase tracking-wider text-muted">
                <th className="text-left px-4 py-3 font-medium">Wine</th>
                <th className="text-left px-4 py-3 font-medium">Tier</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Qty</th>
                <th className="text-left px-4 py-3 font-medium">Price</th>
                <th className="text-left px-4 py-3 font-medium">Requests</th>
                <th className="text-left px-4 py-3 font-medium">Closes</th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-[#1C1C20]/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/allocations/${a.id}`}
                      className="text-primary hover:text-gold transition-colors"
                    >
                      {a.producer}
                    </Link>
                    <p className="text-[11px] text-muted">
                      {a.wineName} · {a.vintage}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {tierSpecForDbTier(a.minimumTier).name}
                    {a.foundingOnly && (
                      <span className="ml-1 text-[10px] text-gold-text">· Founding</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-secondary">{a.quantity}</td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatCurrency(toNumber(a.pricePerBottleUsd))}
                  </td>
                  <td className="px-4 py-3 text-secondary">
                    {a._count.requests}
                  </td>
                  <td className="px-4 py-3 text-secondary whitespace-nowrap">
                    {formatDate(a.closesAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
