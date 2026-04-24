import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Shield,
  Building2,
  ChevronRight,
} from "lucide-react";
import { InsuranceReferralStatus } from "@prisma/client";
import InsuranceSavingsCard from "@/components/insurance-savings-card";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { estimateInsuranceSavings, INSURANCE_PARTNERS } from "@/lib/insurance";
import { tierSpecForDbTier } from "@/lib/tiers";
import { formatDate, toNumber } from "@/lib/utils";
import ReferralForm from "./referral-form";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InsuranceReferralStatus, string> = {
  submitted: "Submitted",
  in_review: "In review",
  introduced: "Introduced",
  bound: "Enrolled",
  declined: "Declined",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<InsuranceReferralStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  in_review: "bg-gold/10 text-gold border-gold/30",
  introduced: "bg-ok/10 text-ok border-ok/30",
  bound: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

function isInsuranceConfigured(): boolean {
  if (!env.INSURANCE_PARTNER_ENABLED) return false;
  if (env.INSURANCE_API_SECRET) return true;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

function isOpenStatus(status: InsuranceReferralStatus): boolean {
  return (
    status === InsuranceReferralStatus.submitted ||
    status === InsuranceReferralStatus.in_review ||
    status === InsuranceReferralStatus.introduced
  );
}

export default async function InsuranceSettingsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  const memberId = session.user.id;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, tier: true },
  });
  if (!member) redirect("/auth/login");

  const configured = isInsuranceConfigured();

  const portfolio = await prisma.wine.aggregate({
    where: { memberId, status: "in_cellar" },
    _sum: { currentValue: true },
    _count: { _all: true },
  });
  const collectionValueUsd = portfolio._sum.currentValue
    ? toNumber(portfolio._sum.currentValue)
    : 0;
  const tierSpec = tierSpecForDbTier(member.tier);
  const insuranceEstimate = estimateInsuranceSavings({
    collectionValueUsd,
    tier: tierSpec.slug,
  });

  const referrals = await prisma.insuranceReferral.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      partnerName: true,
      status: true,
      shareToken: true,
      policyNumber: true,
      contactEmail: true,
      createdAt: true,
      introducedAt: true,
      boundAt: true,
      declinedAt: true,
      cancelledAt: true,
    },
  });

  const openReferral = referrals.find((r) => isOpenStatus(r.status)) ?? null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to settings
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">
            Insurance partner program
          </h1>
          <p className="text-sm text-muted">
            Enrollment referrals + proof-of-storage exports for carrier
            underwriting
          </p>
        </div>
      </div>

      {!configured && (
        <div className="glass-card border border-warn/30 bg-warn/10 p-5 mb-6">
          <p className="text-sm text-primary font-medium mb-1">
            Not configured
          </p>
          <p className="text-xs text-warn">
            This environment has the insurance partner program disabled. Set{" "}
            <span className="font-mono">INSURANCE_PARTNER_ENABLED=true</span>{" "}
            and <span className="font-mono">INSURANCE_API_SECRET</span> to
            enable referrals and carrier verification endpoints.
          </p>
        </div>
      )}

      {/* Savings narrative (#56) */}
      <div className="mb-6">
        <InsuranceSavingsCard estimate={insuranceEstimate} />
      </div>

      {/* Partner overview */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-start gap-3 mb-4">
          <Building2 className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-serif text-lg text-primary">Named carriers</h2>
            <p className="text-sm text-secondary mt-1">
              Caveau routes proof-of-storage letters and signed CCR exports to
              these HNW &amp; collectibles specialists.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {INSURANCE_PARTNERS.map((p) => (
            <span
              key={p.name}
              title={p.focus}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs bg-caveau-graphite/60 border border-[#2A2A30]/80 text-secondary"
            >
              {p.name}
              <span className="text-muted ml-2">·</span>
              <span className="text-muted ml-2">{p.focus}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Enrollment */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Request a referral</h2>
        </div>
        <p className="text-xs text-muted mb-6">
          Submit once — our concierge team will package proof-of-storage and
          CCR exports for underwriting.
        </p>

        <ReferralForm
          configured={configured}
          openReferral={
            openReferral
              ? {
                  id: openReferral.id,
                  partnerName: openReferral.partnerName,
                  status: openReferral.status,
                  shareToken: openReferral.shareToken,
                }
              : null
          }
        />
      </div>

      {/* History */}
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-serif text-lg text-primary">Your requests</h2>
          <span className="text-xs text-muted">
            {referrals.length} on file · {portfolio._count._all} bottles in
            cellar
          </span>
        </div>

        {referrals.length === 0 ? (
          <p className="text-sm text-muted italic">
            No insurance referrals yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#2A2A30]/50">
            {referrals.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_STYLES[r.status]}`}
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                      <span className="text-[11px] text-muted">
                        Submitted {formatDate(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-primary font-medium">
                      {r.partnerName}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Carrier reference token{" "}
                      <span className="font-mono break-all">{r.shareToken}</span>
                    </p>
                    {(r.policyNumber || r.contactEmail) && (
                      <p className="text-xs text-secondary mt-1">
                        {r.policyNumber ? `Policy ${r.policyNumber}` : ""}
                        {r.policyNumber && r.contactEmail ? " · " : ""}
                        {r.contactEmail ?? ""}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/settings/insurance`}
                    className="text-xs text-gold hover:underline inline-flex items-center gap-1"
                  >
                    Details
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

