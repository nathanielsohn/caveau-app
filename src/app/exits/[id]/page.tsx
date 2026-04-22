import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  Package,
  ShieldCheck,
  Target,
  Wine as WineIcon,
} from "lucide-react";
import { ExitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  CHANNEL_DESCRIPTION,
  formatChannelWithHouse,
  isMemberCancellable,
  MEMBER_STATUS_COPY,
} from "@/lib/exits";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import CancelExitButton from "./cancel-exit-button";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<ExitStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  listed: "bg-ok/10 text-ok border-ok/30",
  sold: "bg-ok/10 text-ok border-ok/30",
  withdrawn: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function ExitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  const memberId = session.user.id;

  const { id } = await params;
  const exit = await prisma.exitFacilitation.findFirst({
    where: { id, memberId },
    include: {
      wine: {
        select: {
          id: true,
          name: true,
          producer: true,
          vintage: true,
          currentValue: true,
        },
      },
    },
  });
  if (!exit) notFound();

  const cancellable = isMemberCancellable(exit.status);

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/exits"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to exits
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[exit.status]}`}
          >
            {MEMBER_STATUS_COPY[exit.status]}
          </span>
          <span className="text-[11px] text-muted">
            Submitted {formatDate(exit.createdAt)}
          </span>
        </div>

        <h1 className="font-serif text-3xl text-primary tracking-wide mb-1">
          {exit.wine.vintage} {exit.wine.producer}
        </h1>
        <Link
          href={`/wine/${exit.wine.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-gold-text hover:text-gold transition-colors"
        >
          <WineIcon className="w-3.5 h-3.5" />
          {exit.wine.name}
        </Link>

        {/* Lifecycle status copy */}
        <StatusCopy
          status={exit.status}
          withdrawnReason={exit.withdrawnReason}
        />

        {/* Channel & listing */}
        {(exit.channel || exit.listedPriceUsd) && (
          <div className="glass-card p-6">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
              Listing
            </p>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {exit.channel && (
                <div>
                  <dt className="text-xs text-muted mb-1">Channel</dt>
                  <dd className="text-primary">
                    {formatChannelWithHouse({
                      channel: exit.channel,
                      auctionHouseName: exit.auctionHouseName,
                    })}
                  </dd>
                  <dd className="text-[11px] text-muted mt-1 leading-relaxed">
                    {CHANNEL_DESCRIPTION[exit.channel]}
                  </dd>
                </div>
              )}
              {exit.listedPriceUsd && (
                <div>
                  <dt className="text-xs text-muted mb-1">Listed at</dt>
                  <dd className="font-serif text-lg text-primary tabular-nums">
                    {formatCurrency(toNumber(exit.listedPriceUsd))}
                  </dd>
                </div>
              )}
              {exit.listedAt && (
                <div>
                  <dt className="text-xs text-muted mb-1">Listed on</dt>
                  <dd className="text-primary">{formatDate(exit.listedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Settlement — gross/net only, commission hidden from member */}
        {exit.status === ExitStatus.sold && exit.grossProceedsUsd && (
          <div className="glass-card p-6">
            <div className="flex items-start gap-3 mb-4">
              <DollarSign className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-ok mb-1">
                  Settled
                </p>
                <p className="font-serif text-lg text-primary">
                  Net proceeds{" "}
                  <span className="text-gold-text tabular-nums">
                    {exit.netProceedsUsd != null
                      ? formatCurrency(toNumber(exit.netProceedsUsd))
                      : "—"}
                  </span>
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-[#2A2A30]/50">
              <div>
                <dt className="text-xs text-muted mb-1">Gross proceeds</dt>
                <dd className="text-primary tabular-nums">
                  {formatCurrency(toNumber(exit.grossProceedsUsd))}
                </dd>
              </div>
              {exit.soldAt && (
                <div>
                  <dt className="text-xs text-muted mb-1">Closed</dt>
                  <dd className="text-primary">{formatDate(exit.soldAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Target range */}
        {(exit.targetPriceLow || exit.targetPriceHigh || exit.memberNote) && (
          <div className="glass-card p-6">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
              Your brief
            </p>
            {(exit.targetPriceLow || exit.targetPriceHigh) && (
              <div className="flex items-center gap-2 text-sm mb-3">
                <Target className="w-4 h-4 text-gold" />
                <span className="text-muted">Target range</span>
                <span className="text-primary tabular-nums">
                  {exit.targetPriceLow
                    ? formatCurrency(toNumber(exit.targetPriceLow))
                    : "—"}
                  {" – "}
                  {exit.targetPriceHigh
                    ? formatCurrency(toNumber(exit.targetPriceHigh))
                    : "—"}
                </span>
              </div>
            )}
            {exit.memberNote && (
              <div className="pt-2 border-t border-[#2A2A30]/50">
                <p className="text-xs text-muted mb-1">Note</p>
                <p className="text-sm text-secondary italic">
                  &ldquo;{exit.memberNote}&rdquo;
                </p>
              </div>
            )}
          </div>
        )}

        {exit.staffNote && (
          <div className="glass-card p-6">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
              Note from concierge
            </p>
            <p className="text-sm text-secondary leading-relaxed">
              {exit.staffNote}
            </p>
          </div>
        )}

        {cancellable && <CancelExitButton exitId={exit.id} />}

        <div className="glass-card p-6">
          <div className="flex items-start gap-3 mb-2">
            <ShieldCheck className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
            <p className="font-serif text-lg text-primary">What&apos;s included</p>
          </div>
          <p className="text-sm text-secondary leading-relaxed">
            Every consignment ships with the bottle&apos;s Caveau Custody
            & Condition Report, full Sentinel environmental history,
            current Liv-ex valuation, and bottle photo. For concierge
            channels we also include a shareable recipient bundle that
            auction houses and brokers can open inline.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusCopy({
  status,
  withdrawnReason,
}: {
  status: ExitStatus;
  withdrawnReason: string | null;
}) {
  if (status === ExitStatus.cancelled) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-secondary">
          This request was cancelled. Start a new one any time from the{" "}
          <Link href="/collection" className="text-gold hover:text-gold/80">
            collection page
          </Link>
          .
        </p>
      </div>
    );
  }
  if (status === ExitStatus.withdrawn) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-start gap-3 mb-2">
          <Package className="w-5 h-5 text-muted flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted mb-1">
              Withdrawn
            </p>
            <p className="font-serif text-lg text-primary">
              Listing pulled
            </p>
          </div>
        </div>
        <p className="text-sm text-secondary leading-relaxed">
          {withdrawnReason ??
            "Your concierge pulled the listing — see notes above for context."}
        </p>
      </div>
    );
  }
  if (status === ExitStatus.sold) {
    return null;
  }
  if (status === ExitStatus.listed) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-start gap-3 mb-2">
          <Target className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-ok mb-1">
              Listed
            </p>
            <p className="font-serif text-lg text-primary">On the market</p>
          </div>
        </div>
        <p className="text-sm text-secondary leading-relaxed">
          Your bottle is live on the chosen channel. Settlement usually
          follows within 30–60 days of close of sale; you&apos;ll see net
          proceeds here the moment the sale clears.
        </p>
      </div>
    );
  }
  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-2">
        <Clock className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-1">
            In review
          </p>
          <p className="font-serif text-lg text-primary">
            Awaiting channel recommendation
          </p>
        </div>
      </div>
      <p className="text-sm text-secondary leading-relaxed">
        Your concierge is reviewing the brief against the bottle&apos;s
        Liv-ex momentum and upcoming auction calendar. Expect a
        recommendation within two business days.
      </p>
    </div>
  );
}
