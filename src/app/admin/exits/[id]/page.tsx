import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, DollarSign } from "lucide-react";
import { ExitStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import {
  CHANNEL_LABELS,
  computeCommission,
  formatChannelWithHouse,
  STATUS_LABELS,
  TARGET_COMMISSION_PCT_HIGH,
  TARGET_COMMISSION_PCT_LOW,
} from "@/lib/exits";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import ExitLifecycleActions from "./exit-lifecycle-actions";
import ListExitForm from "./list-exit-form";
import SellExitForm from "./sell-exit-form";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<ExitStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  listed: "bg-ok/10 text-ok border-ok/30",
  sold: "bg-ok/10 text-ok border-ok/30",
  withdrawn: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AdminExitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const exit = await prisma.exitFacilitation.findUnique({
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
      wine: {
        select: {
          id: true,
          name: true,
          producer: true,
          vintage: true,
          currentValue: true,
        },
      },
      soldBy: { select: { name: true } },
    },
  });
  if (!exit) notFound();

  const tierSpec = tierSpecForDbTier(exit.member.tier);

  const gross = exit.grossProceedsUsd ? toNumber(exit.grossProceedsUsd) : null;
  const pct = exit.commissionPct ? toNumber(exit.commissionPct) : null;
  const commission =
    gross != null && pct != null
      ? computeCommission({ grossProceedsUsd: gross, commissionPct: pct })
      : null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Link
        href="/admin/exits"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All exits
      </Link>

      {/* Header */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[exit.status]}`}
              >
                {STATUS_LABELS[exit.status]}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-gold-text">
                {tierSpec.name}
              </span>
              {exit.member.foundingMember && (
                <span className="text-[10px] uppercase tracking-widest text-gold">
                  Founding
                </span>
              )}
            </div>
            <h1 className="font-serif text-2xl md:text-3xl text-primary leading-tight">
              {exit.wine.vintage} {exit.wine.producer}
            </h1>
            <Link
              href={`/wine/${exit.wine.id}`}
              className="text-sm text-gold-text hover:text-gold transition-colors"
            >
              {exit.wine.name}
            </Link>
            <p className="text-xs text-muted mt-2">
              {exit.member.name} · {exit.member.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[#2A2A30]/50">
          <Stat label="Submitted" value={formatDate(exit.createdAt)} />
          <Stat
            label="Current value"
            value={formatCurrency(toNumber(exit.wine.currentValue))}
          />
          <Stat
            label="Target low"
            value={
              exit.targetPriceLow
                ? formatCurrency(toNumber(exit.targetPriceLow))
                : "—"
            }
          />
          <Stat
            label="Target high"
            value={
              exit.targetPriceHigh
                ? formatCurrency(toNumber(exit.targetPriceHigh))
                : "—"
            }
          />
        </div>

        {exit.preferredChannel && (
          <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
            <p className="text-xs text-muted">
              Member preference:{" "}
              <span className="text-secondary">
                {CHANNEL_LABELS[exit.preferredChannel]}
              </span>{" "}
              <span className="text-[11px] text-muted">(non-binding)</span>
            </p>
          </div>
        )}

        {exit.memberNote && (
          <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
            <p className="text-xs text-muted mb-1">Member note</p>
            <p className="text-sm text-secondary italic">
              &ldquo;{exit.memberNote}&rdquo;
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: lifecycle actions */}
        <div className="space-y-4">
          <ExitLifecycleActions
            exitId={exit.id}
            status={exit.status}
            currentStaffNote={exit.staffNote}
          />
          {exit.status === ExitStatus.requested && (
            <ListExitForm
              exitId={exit.id}
              preferredChannel={exit.preferredChannel}
              currentValueUsd={toNumber(exit.wine.currentValue)}
              targetPriceLow={
                exit.targetPriceLow ? toNumber(exit.targetPriceLow) : null
              }
              targetPriceHigh={
                exit.targetPriceHigh ? toNumber(exit.targetPriceHigh) : null
              }
            />
          )}
          {exit.status === ExitStatus.listed && exit.channel && (
            <SellExitForm
              exitId={exit.id}
              channel={exit.channel}
              listedPriceUsd={
                exit.listedPriceUsd ? toNumber(exit.listedPriceUsd) : null
              }
            />
          )}
        </div>

        {/* Right: settlement / listing record */}
        <div className="space-y-4">
          {exit.status === ExitStatus.listed && (
            <div className="glass-card p-5">
              <p className="text-[10px] uppercase tracking-widest text-ok mb-3">
                Listing record
              </p>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted mb-1">Channel</dt>
                  <dd className="text-primary">
                    {formatChannelWithHouse({
                      channel: exit.channel,
                      auctionHouseName: exit.auctionHouseName,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Listed at</dt>
                  <dd className="text-primary">
                    {exit.listedPriceUsd
                      ? formatCurrency(toNumber(exit.listedPriceUsd))
                      : "—"}
                  </dd>
                </div>
                {exit.listedAt && (
                  <div>
                    <dt className="text-xs text-muted mb-1">Listed on</dt>
                    <dd className="text-primary">
                      {formatDate(exit.listedAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {exit.status === ExitStatus.sold && commission && gross != null && (
            <div className="glass-card p-5">
              <div className="flex items-start gap-2 mb-3">
                <DollarSign className="w-4 h-4 text-ok flex-shrink-0 mt-0.5" />
                <p className="text-[10px] uppercase tracking-widest text-ok">
                  Settlement record
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted mb-1">Channel</dt>
                  <dd className="text-primary">
                    {formatChannelWithHouse({
                      channel: exit.channel,
                      auctionHouseName: exit.auctionHouseName,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Closed</dt>
                  <dd className="text-primary">
                    {exit.soldAt ? formatDate(exit.soldAt) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Gross proceeds</dt>
                  <dd className="text-primary tabular-nums">
                    {formatCurrency(gross)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted mb-1">Net proceeds</dt>
                  <dd className="text-primary tabular-nums">
                    {formatCurrency(commission.netProceedsUsd)}
                  </dd>
                </div>
              </dl>
              <div
                className={`mt-4 px-3 py-2 rounded-lg border text-xs ${
                  commission.withinTargetBand || pct === 0
                    ? "bg-ok/10 border-ok/30 text-ok"
                    : "bg-danger/10 border-danger/30 text-danger"
                }`}
              >
                Commission: {formatCurrency(commission.commissionUsd)} ·{" "}
                {pct != null ? pct.toFixed(2) : "—"}%
                {pct !== 0 && !commission.withinTargetBand && (
                  <span className="block text-[11px] mt-1">
                    Outside the {TARGET_COMMISSION_PCT_LOW}–
                    {TARGET_COMMISSION_PCT_HIGH}% target band.
                  </span>
                )}
              </div>
              {exit.soldBy?.name && (
                <p className="text-[11px] text-muted mt-3">
                  Closed by {exit.soldBy.name}
                </p>
              )}
            </div>
          )}

          {exit.status === ExitStatus.withdrawn && (
            <div className="glass-card p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                Withdrawn
              </p>
              <p className="text-sm text-secondary leading-relaxed">
                {exit.withdrawnReason ??
                  "Withdrawn — no reason on file."}
              </p>
              {exit.withdrawnAt && (
                <p className="text-[11px] text-muted mt-2">
                  {formatDate(exit.withdrawnAt)}
                </p>
              )}
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
