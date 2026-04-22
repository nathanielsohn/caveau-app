import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Target, ShieldCheck } from "lucide-react";
import { ExitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatChannelWithHouse,
  MEMBER_STATUS_COPY,
} from "@/lib/exits";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Exits · Caveau",
  description:
    "Consign a bottle — Caveau handles the auction, broker, or private-sale path.",
};

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<ExitStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  listed: "bg-ok/10 text-ok border-ok/30",
  sold: "bg-ok/10 text-ok border-ok/30",
  withdrawn: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function ExitsListPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login?callbackUrl=%2Fexits");
  const memberId = session.user.id;

  const exits = await prisma.exitFacilitation.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: {
      wine: {
        select: { id: true, name: true, producer: true, vintage: true },
      },
    },
    take: 50,
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          Concierge consignment
        </p>
        <h1 className="font-serif text-3xl md:text-4xl text-primary tracking-wide">
          Exits
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-xl">
          When a bottle is ready to sell, we bundle its Caveau Custody &
          Condition Report with the Sentinel history and broker it through
          the right channel — auction house, private sale, or our partner
          network.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <p className="text-xs text-muted max-w-md">
          Start from a bottle detail page. An open exit signal is the
          usual trigger, but any in-cellar bottle can be consigned.
        </p>
        <Link
          href="/collection"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm font-medium hover:border-gold/40 transition-colors"
        >
          <Target className="w-4 h-4" />
          Browse collection
        </Link>
      </div>

      {exits.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Target className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="font-serif text-xl text-primary mb-2">
            No exits yet
          </p>
          <p className="text-sm text-secondary max-w-md mx-auto">
            Ready to place a bottle on the market? Open any bottle in your
            collection and tap Consign — or act on an open exit signal
            from the dashboard.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {exits.map((e) => {
            const proceedsDisplay = e.netProceedsUsd
              ? formatCurrency(toNumber(e.netProceedsUsd))
              : e.listedPriceUsd
                ? `~${formatCurrency(toNumber(e.listedPriceUsd))}`
                : null;
            const proceedsLabel = e.netProceedsUsd
              ? "Net proceeds"
              : e.listedPriceUsd
                ? "Listed"
                : null;
            return (
              <Link
                key={e.id}
                href={`/exits/${e.id}`}
                className="group glass-card p-5 md:p-6 hover:border-gold/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[e.status]}`}
                      >
                        {MEMBER_STATUS_COPY[e.status]}
                      </span>
                      <span className="text-[11px] text-muted">
                        {formatDate(e.createdAt)}
                      </span>
                    </div>
                    <p className="font-serif text-lg text-primary group-hover:text-gold-text transition-colors truncate">
                      {e.wine.vintage} {e.wine.producer} — {e.wine.name}
                    </p>
                    {e.channel && (
                      <p className="text-xs text-muted mt-0.5">
                        {formatChannelWithHouse({
                          channel: e.channel,
                          auctionHouseName: e.auctionHouseName,
                        })}
                      </p>
                    )}
                  </div>
                  {proceedsDisplay && proceedsLabel && (
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">
                        {proceedsLabel}
                      </p>
                      <p className="font-serif text-lg text-primary">
                        {proceedsDisplay}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 glass-card p-6 md:p-8">
        <div className="flex items-start gap-3 mb-3">
          <ShieldCheck className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <h2 className="font-serif text-lg text-primary">
            How consignment works
          </h2>
        </div>
        <p className="text-sm text-secondary leading-relaxed">
          Every exit ships with the bottle&apos;s full chain of custody —
          Caveau Custody & Condition Report, Sentinel environmental
          history, current Liv-ex valuation, and bottle photo. That
          bundle is what lets auction houses list without an additional
          provenance review. For self-handled exits, the same bundle is
          yours to share privately.
        </p>
      </div>
    </div>
  );
}
