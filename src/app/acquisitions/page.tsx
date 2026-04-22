import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { AcquisitionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatAcquisitionSpec,
  MEMBER_STATUS_COPY,
} from "@/lib/acquisitions";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sourcing · Caveau",
  description:
    "Request a specific bottle — Caveau sources it from brokers, auction, or the private network.",
};

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AcquisitionStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  sourcing: "bg-ok/10 text-ok border-ok/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AcquisitionsListPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login?callbackUrl=%2Facquisitions");
  const memberId = session.user.id;

  const acquisitions = await prisma.acquisition.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          Concierge sourcing
        </p>
        <h1 className="font-serif text-3xl md:text-4xl text-primary tracking-wide">
          Acquisitions
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-xl">
          Tell us what you&apos;re after and we&apos;ll work our broker
          network, Liv-ex, and upcoming auctions. Every bottle arrives with a
          Caveau Custody & Condition Report from day one.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <p className="text-xs text-muted max-w-md">
          Be as specific or as flexible as you like — an exact vintage, a
          range, a region under a budget cap. We&apos;ll confirm the quote
          before we commit.
        </p>
        <Link
          href="/acquisitions/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm font-medium hover:border-gold/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Request a bottle
        </Link>
      </div>

      {acquisitions.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Search className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="font-serif text-xl text-primary mb-2">
            No acquisitions yet
          </p>
          <p className="text-sm text-secondary max-w-md mx-auto">
            Ready to hunt down something specific? Click Request a bottle and
            we&apos;ll get sourcing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {acquisitions.map((a) => (
            <Link
              key={a.id}
              href={`/acquisitions/${a.id}`}
              className="group glass-card p-5 md:p-6 hover:border-gold/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {MEMBER_STATUS_COPY[a.status]}
                    </span>
                    <span className="text-[11px] text-muted">
                      {formatDate(a.createdAt)}
                    </span>
                  </div>
                  <p className="font-serif text-lg text-primary group-hover:text-gold-text transition-colors truncate">
                    {formatAcquisitionSpec(a)}
                  </p>
                  {a.maxBudgetUsd && (
                    <p className="text-xs text-muted mt-0.5">
                      Budget cap {formatCurrency(toNumber(a.maxBudgetUsd))}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {a.memberPriceUsd ? (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">
                        Your price
                      </p>
                      <p className="font-serif text-lg text-primary">
                        {formatCurrency(toNumber(a.memberPriceUsd))}
                      </p>
                    </>
                  ) : a.estimatedTotalUsd ? (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">
                        Quote
                      </p>
                      <p className="font-serif text-lg text-primary">
                        {formatCurrency(toNumber(a.estimatedTotalUsd))}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted">—</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 glass-card p-6 md:p-8">
        <div className="flex items-start gap-3 mb-3">
          <ShieldCheck className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <h2 className="font-serif text-lg text-primary">
            How sourcing works
          </h2>
        </div>
        <p className="text-sm text-secondary leading-relaxed">
          Our sommeliers scan Liv-ex, the broker network, and active
          auctions for provenance-clean bottles matching your brief. When
          we&apos;ve found one, we share the quote. Approve, we fulfill,
          and the bottle lands in your Caveau locker with a CCR already in
          hand.
        </p>
      </div>
    </div>
  );
}
