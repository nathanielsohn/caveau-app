import { describe, it, expect } from "vitest";
import {
  estimateInsuranceSavings,
  INSURANCE_PARTNERS,
  TIER_DISCOUNT_BANDS,
  INSURANCE_DISCIPLINE_BY_TIER,
  BASELINE_PREMIUM_LOW_PCT,
  BASELINE_PREMIUM_HIGH_PCT,
} from "@/lib/insurance";
import type { TierSlug } from "@/lib/tiers";

describe("estimateInsuranceSavings", () => {
  it("matches the slide 9 reference anchor ($150K, Private Vault)", () => {
    const r = estimateInsuranceSavings({
      collectionValueUsd: 150_000,
      tier: "private_vault",
    });
    // baselineLow  = 150,000 × 1.0% = 1,500 → × 22% = 330
    // baselineHigh = 150,000 × 1.5% = 2,250 → × 32% = 720
    expect(Math.round(r.savingsLowUsd)).toBe(330);
    expect(Math.round(r.savingsHighUsd)).toBe(720);
    // Deck quotes $300–$790; we're within the band.
  });

  it("scales linearly with collection value", () => {
    const small = estimateInsuranceSavings({
      collectionValueUsd: 100_000,
      tier: "estate",
    });
    const large = estimateInsuranceSavings({
      collectionValueUsd: 400_000,
      tier: "estate",
    });
    expect(large.savingsLowUsd).toBeCloseTo(small.savingsLowUsd * 4, 6);
    expect(large.savingsHighUsd).toBeCloseTo(small.savingsHighUsd * 4, 6);
  });

  it("ladders discount bands up from Collector to Estate", () => {
    const tiers: TierSlug[] = [
      "collector",
      "reserve",
      "private_vault",
      "estate",
    ];
    for (let i = 1; i < tiers.length; i++) {
      const prev = TIER_DISCOUNT_BANDS[tiers[i - 1]];
      const curr = TIER_DISCOUNT_BANDS[tiers[i]];
      expect(curr.low).toBeGreaterThan(prev.low);
      expect(curr.high).toBeGreaterThan(prev.high);
    }
  });

  it("keeps every tier's discount band within slide 9's 15–35% envelope", () => {
    const tiers: TierSlug[] = [
      "collector",
      "reserve",
      "private_vault",
      "estate",
    ];
    for (const t of tiers) {
      const band = TIER_DISCOUNT_BANDS[t];
      expect(band.low).toBeGreaterThanOrEqual(0.15);
      expect(band.high).toBeLessThanOrEqual(0.35);
      expect(band.low).toBeLessThan(band.high);
    }
  });

  it("returns zero savings on a zero-value collection", () => {
    const r = estimateInsuranceSavings({
      collectionValueUsd: 0,
      tier: "private_vault",
    });
    expect(r.savingsLowUsd).toBe(0);
    expect(r.savingsHighUsd).toBe(0);
    expect(r.baselinePremiumLowUsd).toBe(0);
    expect(r.baselinePremiumHighUsd).toBe(0);
  });

  it("clamps negative collection values to zero", () => {
    const r = estimateInsuranceSavings({
      collectionValueUsd: -50_000,
      tier: "private_vault",
    });
    expect(r.collectionValueUsd).toBe(0);
    expect(r.savingsLowUsd).toBe(0);
    expect(r.savingsHighUsd).toBe(0);
  });

  it("returns the four named deck partners in order", () => {
    const r = estimateInsuranceSavings({
      collectionValueUsd: 100_000,
      tier: "private_vault",
    });
    expect(r.partners.map((p) => p.name)).toEqual([
      "PURE",
      "Chubb",
      "AXA XL",
      "Berkley One",
    ]);
  });

  it("returns tier-specific discipline bullets — Estate lists bonded courier, Collector does not", () => {
    const collector = estimateInsuranceSavings({
      collectionValueUsd: 100_000,
      tier: "collector",
    });
    const estate = estimateInsuranceSavings({
      collectionValueUsd: 100_000,
      tier: "estate",
    });
    expect(estate.disciplineBullets.length).toBeGreaterThan(
      collector.disciplineBullets.length,
    );
    expect(estate.disciplineBullets.some((b) => /bonded courier/i.test(b))).toBe(
      true,
    );
    expect(
      collector.disciplineBullets.some((b) => /bonded courier/i.test(b)),
    ).toBe(false);
  });

  it("exposes the baseline premium band used for the calculation", () => {
    const r = estimateInsuranceSavings({
      collectionValueUsd: 200_000,
      tier: "reserve",
    });
    expect(r.baselinePremiumLowUsd).toBeCloseTo(
      200_000 * BASELINE_PREMIUM_LOW_PCT,
      6,
    );
    expect(r.baselinePremiumHighUsd).toBeCloseTo(
      200_000 * BASELINE_PREMIUM_HIGH_PCT,
      6,
    );
  });

  it("keeps discipline bullet counts non-decreasing across the tier ladder", () => {
    const tiers: TierSlug[] = [
      "collector",
      "reserve",
      "private_vault",
      "estate",
    ];
    for (let i = 1; i < tiers.length; i++) {
      expect(
        INSURANCE_DISCIPLINE_BY_TIER[tiers[i]].length,
      ).toBeGreaterThanOrEqual(
        INSURANCE_DISCIPLINE_BY_TIER[tiers[i - 1]].length,
      );
    }
    // And every tier carries at least something — an empty list would
    // leave the card with a dead section.
    for (const t of tiers) {
      expect(INSURANCE_DISCIPLINE_BY_TIER[t].length).toBeGreaterThan(0);
    }
  });

  it("names the same partners list across all tiers", () => {
    const tiers: TierSlug[] = [
      "collector",
      "reserve",
      "private_vault",
      "estate",
    ];
    for (const t of tiers) {
      const r = estimateInsuranceSavings({
        collectionValueUsd: 100_000,
        tier: t,
      });
      expect(r.partners).toBe(INSURANCE_PARTNERS);
    }
  });
});
