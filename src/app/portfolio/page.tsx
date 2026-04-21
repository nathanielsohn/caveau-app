import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { toNumber } from "@/lib/utils";
import {
  classifyInvestmentTier,
  calculateCAGR,
  projectValue,
  computePortfolioSummary,
  TIER_ORDER,
  type InvestmentTier,
  type PortfolioWineInput,
} from "@/lib/investment";
import { estimateInsuranceSavings } from "@/lib/insurance";
import { tierSpecForDbTier } from "@/lib/tiers";
import PortfolioClient, { type PortfolioBottle } from "./portfolio-client";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const memberId = session.user.id;

  try {
    // Pull only the fields we need to classify + compute CAGR. Earliest
    // valuation date becomes the CAGR start anchor; if a wine has no
    // historical valuations we fall back to purchase price + createdAt.
    const wines = await prisma.wine.findMany({
      where: { memberId, status: "in_cellar" },
      select: {
        id: true,
        name: true,
        producer: true,
        vintage: true,
        region: true,
        purchasePrice: true,
        currentValue: true,
        createdAt: true,
        valuations: {
          orderBy: { date: "asc" },
          take: 1,
          select: { price: true, date: true },
        },
      },
    });

    const now = new Date();

    const bottles: PortfolioBottle[] = [];
    for (const w of wines) {
      const tier = classifyInvestmentTier({
        producer: w.producer,
        name: w.name,
        vintage: w.vintage,
      });
      if (!tier) continue;

      const purchase = toNumber(w.purchasePrice);
      const current = toNumber(w.currentValue);
      const firstVal = w.valuations[0];
      // Prefer the earliest recorded valuation — it represents the
      // historical market price, not the member's purchase price.
      const anchorPrice = firstVal ? toNumber(firstVal.price) : purchase;
      const anchorDate = firstVal ? firstVal.date : w.createdAt;

      const cagr = calculateCAGR(anchorPrice, current, anchorDate, now);
      const projectedFive = cagr != null ? projectValue(current, cagr, 5) : null;

      bottles.push({
        id: w.id,
        name: w.name,
        producer: w.producer,
        vintage: w.vintage,
        region: w.region,
        tier,
        purchasePrice: purchase,
        currentValue: current,
        cagr,
        projectedFive,
      });
    }

    bottles.sort((a, b) => {
      const tierDiff = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (tierDiff !== 0) return tierDiff;
      return b.currentValue - a.currentValue;
    });

    // Portfolio totals — shared helper so the dashboard card and this
    // page never drift. Earliest-valuation anchor across classified
    // bottles produces a portfolio CAGR that's comparable to Liv-ex's
    // index-level reporting.
    const summaryInputs: PortfolioWineInput[] = wines.map((w) => ({
      producer: w.producer,
      name: w.name,
      vintage: w.vintage,
      purchasePrice: toNumber(w.purchasePrice),
      currentValue: toNumber(w.currentValue),
      createdAt: w.createdAt,
      earliestValuation: w.valuations[0]
        ? { price: toNumber(w.valuations[0].price), date: w.valuations[0].date }
        : null,
    }));
    const summary = computePortfolioSummary(summaryInputs, now);

    // Keep the earliestAnchor ISO available separately for the client —
    // summary doesn't currently carry it since the dashboard card
    // doesn't need it.
    const earliestAnchor = wines.reduce<Date | null>((acc, w) => {
      if (!classifyInvestmentTier(w)) return acc;
      const d = w.valuations[0]?.date ?? w.createdAt;
      return !acc || d < acc ? d : acc;
    }, null);

    // Tier breakdown counts for the summary strip
    const tierCounts: Record<InvestmentTier, number> = {
      icon: 0,
      anchor: 0,
      "blue-chip": 0,
      prestige: 0,
      accessible: 0,
      approachable: 0,
    };
    for (const b of bottles) tierCounts[b.tier] += 1;

    // Insurance savings estimate (feature #56). Uses the full in-cellar
    // collection value rather than investment-grade only — carriers
    // underwrite the whole collection, not just trophy bottles.
    const fullCollectionValueUsd = wines.reduce(
      (sum, w) => sum + toNumber(w.currentValue),
      0,
    );
    const insuranceEstimate = estimateInsuranceSavings({
      collectionValueUsd: fullCollectionValueUsd,
      tier: tierSpecForDbTier(session.user.tier).slug,
    });

    return (
      <PortfolioClient
        bottles={bottles}
        totals={{
          purchase: summary.purchase,
          current: summary.current,
          cagr: summary.cagr,
          projectedFive: summary.projectedFive,
          sp500ProjectedFive: summary.sp500ProjectedFive,
          earliestAnchor: earliestAnchor ? earliestAnchor.toISOString() : null,
        }}
        tierCounts={tierCounts}
        insuranceEstimate={insuranceEstimate}
      />
    );
  } catch (error) {
    logger.error("Portfolio data fetch failed", error, {
      route: "/portfolio",
      userId: memberId,
    });
    return (
      <div className="p-6 md:p-10">
        <div className="glass-card p-10 text-center">
          <p className="text-danger text-lg font-serif mb-2">
            Unable to load portfolio
          </p>
          <p className="text-secondary text-sm">
            There was a problem fetching your investment-grade bottles. Please
            refresh the page or try again later.
          </p>
        </div>
      </div>
    );
  }
}
