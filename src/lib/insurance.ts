/**
 * Insurance savings estimate (feature #56).
 *
 * Static math behind the dashboard/portfolio "Estimated Insurance Savings"
 * card and the AI Advisor's `getInsuranceSavingsEstimate` tool. This is a
 * demo estimate, not a quote — the numbers come from pitch deck slide 9
 * ("Caveau certified storage + Sentinel monitoring + hurricane
 * evacuation can earn a 20–35% insurer discount") rather than a carrier
 * API.
 *
 * How the numbers are built:
 *   baseline premium   = collection value × [1.0%, 1.5%]
 *   carrier discount   = tier-scaled [low%, high%]
 *   estimated savings  = baseline × discount
 *
 * The 1.0–1.5% band brackets typical HNW collectibles rates (carriers
 * vary roughly 0.5–2.0% depending on endorsements, specimens, and
 * location). The 20–35% discount band is straight from slide 9 and is
 * laddered by tier so the tier value ladder is legible on the card:
 * Collector sits at the entry floor (15–25%), Estate hits the top of
 * the deck-stated range (25–35%).
 *
 * Sanity check against slide 9's reference anchors (Private Vault tier):
 *   $150K portfolio → $330–$720/yr savings (deck quotes $300–$790)
 *   $400K portfolio → $880–$1,920/yr savings (deck quotes $1,000–$1,750)
 * Close enough for a demo; actual quotes vary by carrier and specimen.
 */
import type { TierSlug } from "@/lib/tiers";

export interface InsurancePartner {
  name: string;
  /** Short differentiator — why this carrier matters, not marketing copy. */
  focus: string;
}

/**
 * HNW & collectibles specialists Caveau can route storage-discipline
 * letters to. Order matches the pitch deck slide 9 partner list.
 */
export const INSURANCE_PARTNERS: readonly InsurancePartner[] = [
  { name: "PURE", focus: "Member-owned HNW specialist" },
  { name: "Chubb", focus: "Valuable Articles practice" },
  { name: "AXA XL", focus: "Fine art & collectibles lines" },
  { name: "Berkley One", focus: "High-value personal lines" },
] as const;

/** Baseline premium rate range applied to collection value. */
export const BASELINE_PREMIUM_LOW_PCT = 0.010;
export const BASELINE_PREMIUM_HIGH_PCT = 0.015;

interface DiscountBand {
  low: number;
  high: number;
}

/**
 * Tier-scaled carrier discount bands. Each tier's ceiling is bounded by
 * slide 9's stated 20–35% range; Estate sits at the top, Collector at
 * the entry floor. Monotonically increasing low and high per tier so the
 * card reads as a ladder.
 */
export const TIER_DISCOUNT_BANDS: Record<TierSlug, DiscountBand> = {
  collector: { low: 0.15, high: 0.25 },
  reserve: { low: 0.18, high: 0.28 },
  private_vault: { low: 0.22, high: 0.32 },
  estate: { low: 0.25, high: 0.35 },
};

/**
 * Tier-specific storage-discipline bullets — the specific underwriting
 * inputs a carrier would see in a storage letter. Curated from each
 * tier's includedServices with an eye on what an insurer actually cares
 * about (not every tier benefit is underwriting-relevant — quarterly
 * portfolio reviews don't move a premium, but hurricane evacuation does).
 */
export const INSURANCE_DISCIPLINE_BY_TIER: Record<TierSlug, readonly string[]> = {
  collector: [
    "Certified climate-controlled storage",
    "24/7 Sentinel environmental monitoring",
    "Caveau Custody & Condition Reports on demand",
  ],
  reserve: [
    "Certified climate-controlled storage",
    "24/7 Sentinel environmental monitoring",
    "Priority alerts routed to phone and email",
    "Dedicated intake and inventory assistance",
  ],
  private_vault: [
    "Certified climate-controlled storage",
    "24/7 Sentinel environmental monitoring",
    "Priority alerts routed to phone and email",
    "Hurricane Emergency Collection Protection",
    "Quarterly Liv-ex valuations on file",
  ],
  estate: [
    "Certified climate-controlled storage",
    "24/7 Sentinel environmental monitoring",
    "Priority alerts routed to phone and email",
    "Hurricane Emergency Collection Protection",
    "Bonded courier and insurance-grade custody documentation",
    "Auction and broker handoff package",
  ],
};

export interface InsuranceSavingsEstimate {
  collectionValueUsd: number;
  tier: TierSlug;
  /** Low end of the savings band, in USD per year. */
  savingsLowUsd: number;
  /** High end of the savings band, in USD per year. */
  savingsHighUsd: number;
  /** Tier discount rate used for the low estimate (e.g. 0.22 = 22%). */
  discountPctLow: number;
  /** Tier discount rate used for the high estimate. */
  discountPctHigh: number;
  /** Baseline annual premium band (before discount). */
  baselinePremiumLowUsd: number;
  baselinePremiumHighUsd: number;
  partners: readonly InsurancePartner[];
  disciplineBullets: readonly string[];
}

/**
 * Compute the insurance savings estimate for a given collection value
 * and member tier. Negative inputs are clamped to zero — a bug upstream
 * should never render "–$50" on the dashboard.
 */
export function estimateInsuranceSavings(params: {
  collectionValueUsd: number;
  tier: TierSlug;
}): InsuranceSavingsEstimate {
  const value = Math.max(0, params.collectionValueUsd);
  const band = TIER_DISCOUNT_BANDS[params.tier];

  const baselinePremiumLowUsd = value * BASELINE_PREMIUM_LOW_PCT;
  const baselinePremiumHighUsd = value * BASELINE_PREMIUM_HIGH_PCT;

  const savingsLowUsd = baselinePremiumLowUsd * band.low;
  const savingsHighUsd = baselinePremiumHighUsd * band.high;

  return {
    collectionValueUsd: value,
    tier: params.tier,
    savingsLowUsd,
    savingsHighUsd,
    discountPctLow: band.low,
    discountPctHigh: band.high,
    baselinePremiumLowUsd,
    baselinePremiumHighUsd,
    partners: INSURANCE_PARTNERS,
    disciplineBullets: INSURANCE_DISCIPLINE_BY_TIER[params.tier],
  };
}
