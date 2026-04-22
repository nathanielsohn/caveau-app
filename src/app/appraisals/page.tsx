import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { AppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import {
  BASIS_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  checkWelcomeEligibility,
  resolveAppraisalPrice,
} from "@/lib/appraisals";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Appraisals · Caveau",
  description:
    "Insurance, estate, and tax valuations for your Caveau-custodied collection.",
};

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  in_progress: "bg-ok/10 text-ok border-ok/30",
  completed: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AppraisalsListPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login?callbackUrl=%2Fappraisals");
  const memberId = session.user.id;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) redirect("/auth/login");

  const [appraisals, welcome] = await Promise.all([
    prisma.appraisal.findMany({
      where: { memberId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    checkWelcomeEligibility(memberId, member.foundingMember),
  ]);

  const tierSpec = tierSpecForDbTier(member.tier);
  const paidPrice = resolveAppraisalPrice(member.tier, false);

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          {tierSpec.name} benefit
        </p>
        <h1 className="font-serif text-3xl md:text-4xl text-primary tracking-wide">
          Appraisals
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-xl">
          Point-in-time valuation documents for insurance binders, estate
          planning, and tax filings. Signed by our head sommelier, anchored to
          your Caveau Custody & Condition Reports, and hash-verifiable by any
          third party.
        </p>
      </div>

      {/* Welcome appraisal CTA — only when eligible */}
      {welcome.eligible && (
        <div className="glass-card p-6 md:p-8 mb-6 border border-gold/30 bg-gold/5">
          <div className="flex items-start gap-3 mb-3">
            <Sparkles className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-1">
                Founding Circle benefit
              </p>
              <h2 className="font-serif text-xl text-primary">
                Your welcome appraisal is included
              </h2>
            </div>
          </div>
          <p className="text-sm text-secondary leading-relaxed mb-5 max-w-xl">
            A complimentary valuation of your entire collection — perfect for a
            first insurance binder or a fresh estate review. Our head sommelier
            will turn it around within five business days and ship you a
            signed, hash-verifiable PDF.
          </p>
          <Link
            href="/appraisals/new?welcome=1"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Claim welcome appraisal
          </Link>
        </div>
      )}

      {/* New appraisal CTA — always available */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <p className="text-xs text-muted">
          Additional appraisals at {paidPrice.priceDisplay} per document for
          your tier.
        </p>
        <Link
          href="/appraisals/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm font-medium hover:border-gold/40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Request appraisal
        </Link>
      </div>

      {appraisals.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <FileText className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="font-serif text-xl text-primary mb-2">
            No appraisals yet
          </p>
          <p className="text-sm text-secondary max-w-md mx-auto">
            Request an appraisal when you&apos;re ready to bind coverage, brief
            an estate attorney, or document the collection for tax purposes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {appraisals.map((a) => (
            <Link
              key={a.id}
              href={`/appraisals/${a.id}`}
              className="group glass-card p-5 md:p-6 hover:border-gold/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[a.status]}`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                    {a.isWelcomeAppraisal && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-gold-text">
                        <Sparkles className="w-3 h-3" />
                        Welcome
                      </span>
                    )}
                    {a.appraisalNumber && (
                      <span className="font-mono text-[11px] text-muted">
                        {a.appraisalNumber}
                      </span>
                    )}
                  </div>
                  <p className="font-serif text-lg text-primary group-hover:text-gold-text transition-colors">
                    {PURPOSE_LABELS[a.purpose]}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {BASIS_LABELS[a.basis]}
                    {a.bottleCount ? ` · ${a.bottleCount} bottles` : ""}
                    {a.effectiveDate
                      ? ` · Effective ${formatDate(a.effectiveDate)}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  {a.totalBasisUsd ? (
                    <>
                      <p className="text-[10px] uppercase tracking-widest text-muted mb-0.5">
                        Total basis
                      </p>
                      <p className="font-serif text-lg text-primary">
                        {formatCurrency(toNumber(a.totalBasisUsd))}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted">
                      {a.status === AppraisalStatus.submitted
                        ? "Awaiting review"
                        : a.status === AppraisalStatus.in_progress
                          ? "Being drafted"
                          : "—"}
                    </p>
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
            How an appraisal differs from a CCR
          </h2>
        </div>
        <p className="text-sm text-secondary leading-relaxed mb-2">
          A <span className="text-primary">Caveau Custody & Condition Report</span>{" "}
          attests to how a single bottle has been stored — temperature, humidity,
          vibration, access log. An <span className="text-primary">Appraisal</span>{" "}
          attests to the dollar value of your collection (or a scoped subset) at a
          point in time, for a named purpose.
        </p>
        <p className="text-sm text-secondary leading-relaxed">
          Insurance underwriters typically want both: the appraisal tells them
          what to cover; the CCRs tell them why the risk is low.
        </p>
      </div>
    </div>
  );
}
