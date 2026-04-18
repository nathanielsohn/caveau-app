/**
 * Tests for the exit-signals scoring pass (feature #55).
 *
 * We only unit-test the pure scorer here. `reconcileMemberExitSignals`
 * talks to the DB and its happy path is covered implicitly by the seed
 * run — mocking Prisma for a reconciliation loop would test the mock
 * shape, not the rule we care about.
 */
import { describe, it, expect } from "vitest";
import { scoreWineForExit } from "../exit-signals";

const NOW = new Date("2026-04-18T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("scoreWineForExit", () => {
  it("returns null when there's no drink window and no momentum", () => {
    const result = scoreWineForExit({
      drinkWindowStart: null,
      drinkWindowEnd: null,
      currentValue: 150,
      valuations: [
        { date: daysAgo(400), price: 140 },
        { date: daysAgo(30), price: 150 },
      ],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("returns null when the wine is aging under its drink window", () => {
    // Pétrus 2018: drink window 2028–2060. 2026 is two years pre-window.
    const result = scoreWineForExit({
      drinkWindowStart: 2028,
      drinkWindowEnd: 2060,
      currentValue: 6413,
      valuations: [
        { date: daysAgo(400), price: 6300 },
        { date: daysAgo(30), price: 6413 },
      ],
      now: NOW,
    });
    // +1.8% momentum, still aging — should not open a signal
    expect(result).toBeNull();
  });

  it("opens a strong drink-window signal when end is within a year", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2027,
      currentValue: 200,
      valuations: [
        { date: daysAgo(400), price: 195 },
        { date: daysAgo(30), price: 200 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("drink_window_closing");
    expect(result!.strength).toBe("strong");
    // Strong uses the [1.05, 1.20] multiplier band
    expect(result!.targetPriceLow).toBeCloseTo(210, 2);
    expect(result!.targetPriceHigh).toBeCloseTo(240, 2);
  });

  it("opens a moderate drink-window signal when end is within 3 years", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2029,
      currentValue: 200,
      valuations: [
        { date: daysAgo(400), price: 195 },
        { date: daysAgo(30), price: 200 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("drink_window_closing");
    expect(result!.strength).toBe("moderate");
    expect(result!.targetPriceLow).toBeCloseTo(200, 2);
    expect(result!.targetPriceHigh).toBeCloseTo(220, 2);
  });

  it("does not open a drink-window signal when end is more than 3 years out", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2032,
      currentValue: 200,
      valuations: [
        { date: daysAgo(400), price: 195 },
        { date: daysAgo(30), price: 200 },
      ],
      now: NOW,
    });
    // +2.6% momentum, drink-window end is 6 years out → no signal
    expect(result).toBeNull();
  });

  it("opens a strong momentum signal when 12-month change exceeds +30%", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2030,
      drinkWindowEnd: 2050,
      currentValue: 500,
      valuations: [
        { date: daysAgo(365), price: 380 },
        { date: daysAgo(30), price: 500 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("peak_momentum");
    expect(result!.strength).toBe("strong");
    expect(result!.momentum12moPct).toBeGreaterThan(30);
  });

  it("opens a moderate momentum signal when 12-month change is between +20% and +30%", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2030,
      drinkWindowEnd: 2050,
      currentValue: 500,
      valuations: [
        { date: daysAgo(365), price: 400 },
        { date: daysAgo(30), price: 500 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("peak_momentum");
    expect(result!.strength).toBe("moderate");
    expect(result!.momentum12moPct).toBeGreaterThan(20);
    expect(result!.momentum12moPct).toBeLessThan(30);
  });

  it("combines drink-window + momentum into a dual signal", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2029, // within 3yr → moderate
      currentValue: 500,
      valuations: [
        { date: daysAgo(365), price: 400 }, // +25% → moderate
        { date: daysAgo(30), price: 500 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("dual");
    // Both legs are moderate → overall moderate
    expect(result!.strength).toBe("moderate");
  });

  it("promotes dual to strong when either leg is strong", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2027, // within 1yr → strong
      currentValue: 500,
      valuations: [
        { date: daysAgo(365), price: 400 }, // +25% → moderate
        { date: daysAgo(30), price: 500 },
      ],
      now: NOW,
    });
    expect(result).not.toBeNull();
    expect(result!.reason).toBe("dual");
    expect(result!.strength).toBe("strong");
  });

  it("returns null momentum when the oldest valuation is too recent", () => {
    // Only valuations within the last 90 days — no pre-anchor to compare
    // against. Scoring falls through to drink-window only (none here).
    const result = scoreWineForExit({
      drinkWindowStart: null,
      drinkWindowEnd: null,
      currentValue: 500,
      valuations: [
        { date: daysAgo(60), price: 400 },
        { date: daysAgo(5), price: 500 },
      ],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("round-trips target prices to two decimals", () => {
    const result = scoreWineForExit({
      drinkWindowStart: 2023,
      drinkWindowEnd: 2027,
      currentValue: 123.456,
      valuations: [],
      now: NOW,
    });
    expect(result).not.toBeNull();
    // 123.456 * 1.05 = 129.6288 → rounded to 129.63
    expect(result!.targetPriceLow).toBeCloseTo(129.63, 2);
    expect(result!.targetPriceHigh).toBeCloseTo(148.15, 2);
  });
});
