import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AcquisitionStatus, Role } from "@prisma/client";
import { ArrowLeft, Wine } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import {
  computeMargin,
  formatAcquisitionSpec,
  SOURCE_LABELS,
  STATUS_LABELS,
  TARGET_MARGIN_PCT_HIGH,
  TARGET_MARGIN_PCT_LOW,
} from "@/lib/acquisitions";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import AcquisitionLifecycleActions from "./acquisition-lifecycle-actions";
import FulfillForm from "./fulfill-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AcquisitionStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  sourcing: "bg-ok/10 text-ok border-ok/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AdminAcquisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const acquisition = await prisma.acquisition.findUnique({
    where: { id },
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
      sourcedWines: {
        select: {
          id: true,
          name: true,
          producer: true,
          vintage: true,
          currentValue: true,
          purchasePrice: true,
        },
      },
    },
  });
  if (!acquisition) notFound();

  const tierSpec = tierSpecForDbTier(acquisition.member.tier);
  const spec = formatAcquisitionSpec(acquisition);

  const cost = acquisition.actualCostUsd
    ? toNumber(acquisition.actualCostUsd)
    : null;
  const price = acquisition.memberPriceUsd
    ? toNumber(acquisition.memberPriceUsd)
    : null;
  const margin =
    cost != null && price != null
      ? computeMargin({ actualCostUsd: cost, memberPriceUsd: price })
      : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Link
        href="/admin/acquisitions"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All acquisitions
      </Link>

      {/* Header */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[acquisition.status]}`}
              >
                {STATUS_LABELS[acquisition.status]}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gold-text">
                {tierSpec.name}
              </span>
              {acquisition.member.foundingMember && (
                <span className="text-[10px] uppercase tracking-widest text-gold">
                  Founding
                </span>
              )}
            </div>
            <h1 className="font-serif text-2xl md:text-3xl text-primary leading-tight">
              {spec}
            </h1>
            <p className="text-xs text-muted mt-1">
              {acquisition.member.name} · {acquisition.member.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#2A2A30]/50">
          <Stat label="Submitted" value={formatDate(acquisition.createdAt)} />
          <Stat label="Quantity" value={String(acquisition.quantity)} />
          <Stat
            label="Budget cap"
            value={
              acquisition.maxBudgetUsd
                ? formatCurrency(toNumber(acquisition.maxBudgetUsd))
                : "—"
            }
          />
          <Stat
            label="Quote"
            value={
              acquisition.estimatedTotalUsd
                ? formatCurrency(toNumber(acquisition.estimatedTotalUsd))
                : "—"
            }
          />
        </div>

        {acquisition.memberNote && (
          <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
            <p className="text-xs text-muted mb-1">Member note</p>
            <p className="text-sm text-secondary italic">
              &ldquo;{acquisition.memberNote}&rdquo;
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: lifecycle actions */}
        <div className="space-y-4">
          <AcquisitionLifecycleActions
            acquisitionId={acquisition.id}
            status={acquisition.status}
            currentStaffNote={acquisition.staffNote}
          />
          {acquisition.status === AcquisitionStatus.sourcing && (
            <FulfillForm
              acquisitionId={acquisition.id}
              quantity={acquisition.quantity}
              estimatedTotalUsd={
                acquisition.estimatedTotalUsd
                  ? toNumber(acquisition.estimatedTotalUsd)
                  : null
              }
              maxBudgetUsd={
                acquisition.maxBudgetUsd
                  ? toNumber(acquisition.maxBudgetUsd)
                  : null
              }
            />
          )}
        </div>

        {/* Right: fulfillment record */}
        <div className="space-y-4">
          {acquisition.status === AcquisitionStatus.fulfilled && (
            <div className="glass-card p-5">
              <p className="text-[10px] uppercase tracking-widest text-ok mb-3">
                Fulfillment record
              </p>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted mb-1">Source</dt>
                  <dd className="text-primary">
                    {acquisition.source
                      ? SOURCE_LABELS[acquisition.source]
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Fulfilled</dt>
                  <dd className="text-primary">
                    {acquisition.fulfilledAt
                      ? formatDate(acquisition.fulfilledAt)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Our cost</dt>
                  <dd className="text-primary">
                    {cost != null ? formatCurrency(cost) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Member price</dt>
                  <dd className="text-primary">
                    {price != null ? formatCurrency(price) : "—"}
                  </dd>
                </div>
              </dl>
              {margin && margin.marginPct != null && (
                <div
                  className={`mt-4 px-3 py-2 rounded-lg border text-xs ${
                    margin.withinTargetBand
                      ? "bg-ok/10 border-ok/30 text-ok"
                      : "bg-danger/10 border-danger/30 text-danger"
                  }`}
                >
                  Margin: {formatCurrency(margin.marginUsd)} ·{" "}
                  {margin.marginPct.toFixed(2)}%
                  {!margin.withinTargetBand && (
                    <span className="block text-[11px] mt-1">
                      Outside the {TARGET_MARGIN_PCT_LOW}–
                      {TARGET_MARGIN_PCT_HIGH}% target band.
                    </span>
                  )}
                </div>
              )}
              {acquisition.sourcedWines.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Wine className="w-3.5 h-3.5 text-gold" />
                    <p className="text-[10px] uppercase tracking-widest text-gold-text">
                      Added to collection
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {acquisition.sourcedWines.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <Link
                          href={`/wine/${w.id}`}
                          className="text-primary hover:text-gold transition-colors truncate"
                        >
                          {w.vintage} {w.producer} — {w.name}
                        </Link>
                        <span className="text-secondary flex-shrink-0 text-xs">
                          {formatCurrency(toNumber(w.currentValue))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {acquisition.staffNote &&
            acquisition.status !== AcquisitionStatus.sourcing && (
              <div className="glass-card p-5">
                <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                  Staff note (visible to member)
                </p>
                <p className="text-sm text-secondary">
                  {acquisition.staffNote}
                </p>
              </div>
            )}
        </div>
      </div>
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
