import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, Gem } from "lucide-react";
import {
  AllocationRequestStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { bottlesRemaining } from "@/lib/allocations";
import AdminRequestActions from "./admin-request-actions";
import AllocationLifecycleActions from "./allocation-lifecycle-actions";

export const dynamic = "force-dynamic";

const REQUEST_STATUS_STYLES: Record<AllocationRequestStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  accepted: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
};

const REQUEST_STATUS_LABELS: Record<AllocationRequestStatus, string> = {
  submitted: "Submitted",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  fulfilled: "Fulfilled",
};

const REQUEST_FILTERS: {
  value: "all" | AllocationRequestStatus;
  label: string;
}[] = [
  { value: "submitted", label: "Submitted" },
  { value: "accepted", label: "Accepted" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function resolveRequestFilter(
  raw: string | undefined,
): "all" | AllocationRequestStatus {
  if (!raw) return "submitted";
  if (raw === "all") return "all";
  if (
    raw === "submitted" ||
    raw === "accepted" ||
    raw === "declined" ||
    raw === "cancelled" ||
    raw === "fulfilled"
  ) {
    return raw;
  }
  return "submitted";
}

export default async function AdminAllocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const sp = await searchParams;
  const filter = resolveRequestFilter(sp.status);

  const allocation = await prisma.allocation.findUnique({
    where: { id },
    include: {
      requests: {
        orderBy: { createdAt: "desc" },
        include: {
          member: {
            select: {
              id: true,
              name: true,
              email: true,
              tier: true,
              foundingMember: true,
            },
          },
        },
      },
    },
  });
  if (!allocation) notFound();

  const tierSpec = tierSpecForDbTier(allocation.minimumTier);
  const price = toNumber(allocation.pricePerBottleUsd);
  const remaining = bottlesRemaining(allocation, allocation.requests);

  const where: Prisma.AllocationRequestWhereInput =
    filter === "all"
      ? { allocationId: id }
      : { allocationId: id, status: filter };

  // We already loaded all requests above for invariants; filter in memory.
  const visibleRequests =
    filter === "all"
      ? allocation.requests
      : allocation.requests.filter((r) => r.status === filter);

  const statusCounts = allocation.requests.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<AllocationRequestStatus, number>,
  );
  void where;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Link
        href="/admin/allocations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All allocations
      </Link>

      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium mb-3">
              <Gem className="w-3.5 h-3.5" />
              {tierSpec.name}
              {allocation.foundingOnly ? " · Founding" : " and above"}
              {allocation.foundingEarlyAccess && " · Early access"}
            </div>
            <h1 className="font-serif text-2xl md:text-3xl text-primary leading-tight">
              {allocation.producer}
            </h1>
            <p className="font-serif text-lg text-secondary mt-0.5">
              {allocation.wineName} · {allocation.vintage}
            </p>
            <p className="text-xs text-muted mt-1">
              {allocation.region} · {allocation.varietal}
            </p>
          </div>
          <AllocationLifecycleActions
            allocationId={allocation.id}
            status={allocation.status}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#2A2A30]/50">
          <Stat label="Status" value={allocation.status} />
          <Stat
            label="Price / bottle"
            value={formatCurrency(price)}
          />
          <Stat
            label="Availability"
            value={`${remaining} / ${allocation.quantity}`}
          />
          <Stat label="Closes" value={formatDate(allocation.closesAt)} />
        </div>

        <div className="mt-4 pt-4 border-t border-[#2A2A30]/50 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted">
            Slug: <span className="text-secondary">{allocation.slug}</span> ·
            Opens {formatDate(allocation.opensAt)}
          </p>
          <Link
            href={`/admin/allocations/${allocation.id}/export`}
            className="inline-flex items-center gap-1.5 text-xs text-gold-text hover:text-gold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export requests CSV
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {REQUEST_FILTERS.map((f) => {
          const count =
            f.value === "all"
              ? allocation.requests.length
              : (statusCounts[f.value] ?? 0);
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={`/admin/allocations/${allocation.id}?status=${f.value}`}
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

      {visibleRequests.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">No requests in this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleRequests.map((req) => (
            <div key={req.id} className="glass-card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-primary">{req.member.name}</p>
                    <span className="text-[10px] uppercase tracking-widest text-gold-text">
                      {tierSpecForDbTier(req.member.tier).name}
                    </span>
                    {req.member.foundingMember && (
                      <span className="text-[10px] uppercase tracking-widest text-gold">
                        Founding
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted">{req.member.email}</p>
                  <p className="text-xs text-secondary mt-2">
                    Requested {req.quantityRequested}{" "}
                    {req.quantityRequested === 1 ? "bottle" : "bottles"} ·{" "}
                    {formatDate(req.createdAt)}
                  </p>
                  {req.memberNote && (
                    <p className="text-xs text-muted mt-1 italic">
                      &ldquo;{req.memberNote}&rdquo;
                    </p>
                  )}
                  {req.staffNote && (
                    <p className="text-xs text-secondary mt-1">
                      Staff note: {req.staffNote}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${REQUEST_STATUS_STYLES[req.status]}`}
                >
                  {REQUEST_STATUS_LABELS[req.status]}
                </span>
              </div>

              <div className="mt-4 pt-4 border-t border-[#2A2A30]/30">
                <AdminRequestActions
                  requestId={req.id}
                  status={req.status}
                  allocationStatus={allocation.status}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="text-sm text-primary mt-1">{value}</p>
    </div>
  );
}
