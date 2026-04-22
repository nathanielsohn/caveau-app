import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { WineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import {
  checkWelcomeEligibility,
  resolveAppraisalPrice,
} from "@/lib/appraisals";
import { toNumber } from "@/lib/utils";
import NewAppraisalForm, { type PortfolioWineLite } from "./new-appraisal-form";

export const dynamic = "force-dynamic";

export default async function NewAppraisalPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=%2Fappraisals%2Fnew");
  }
  const memberId = session.user.id;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) redirect("/auth/login");

  const params = await searchParams;
  const welcomeRequested = params.welcome === "1";

  const [welcomeDecision, wines] = await Promise.all([
    checkWelcomeEligibility(memberId, member.foundingMember),
    prisma.wine.findMany({
      where: { memberId, status: WineStatus.in_cellar },
      orderBy: [{ currentValue: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        producer: true,
        vintage: true,
        region: true,
        currentValue: true,
      },
    }),
  ]);

  // If the member clicked "Claim welcome" from the dashboard or list page
  // but already has a welcome appraisal on record, surface a clear
  // message and send them to the existing one instead of silently
  // downgrading to a paid request.
  if (welcomeRequested && welcomeDecision.existing) {
    redirect(`/appraisals/${welcomeDecision.existing.id}`);
  }

  const tierSpec = tierSpecForDbTier(member.tier);
  const paidPrice = resolveAppraisalPrice(member.tier, false);
  const applyWelcome = welcomeRequested && welcomeDecision.eligible;

  const wineLite: PortfolioWineLite[] = wines.map((w) => ({
    id: w.id,
    name: w.name,
    producer: w.producer,
    vintage: w.vintage,
    region: w.region,
    currentValueUsd: toNumber(w.currentValue),
  }));

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/appraisals"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to appraisals
      </Link>

      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          {tierSpec.name} · {applyWelcome ? "Welcome appraisal" : paidPrice.priceDisplay}
        </p>
        <h1 className="font-serif text-3xl text-primary tracking-wide">
          Request an appraisal
        </h1>
        <p className="text-sm text-secondary mt-2">
          Tell us what this appraisal is for and which bottles to include. Our
          head sommelier turns these around in five business days.
        </p>
      </div>

      {applyWelcome && (
        <div className="mb-5 glass-card p-4 border border-gold/30 bg-gold/5">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
            <p className="text-sm text-secondary leading-relaxed">
              <span className="text-primary font-medium">
                Founding Circle welcome appraisal
              </span>{" "}
              — included. No charge on this document.
            </p>
          </div>
        </div>
      )}

      <NewAppraisalForm
        wines={wineLite}
        applyWelcome={applyWelcome}
        paidPriceDisplay={paidPrice.priceDisplay}
      />
    </div>
  );
}
