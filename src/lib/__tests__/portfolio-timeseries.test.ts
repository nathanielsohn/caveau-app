import { describe, it, expect } from "vitest";
import {
  computePortfolioValueAt,
  buildPortfolioVsLivexSeries,
  MIN_YTD_POINTS,
  type TimeseriesWine,
  type LivexPoint,
} from "@/lib/portfolio-timeseries";

function wine(
  createdAt: string,
  purchasePrice: number,
  valuations: Array<[string, number]>,
): TimeseriesWine {
  return {
    createdAt: new Date(createdAt),
    purchasePrice,
    valuations: valuations.map(([d, price]) => ({
      date: new Date(d),
      price,
    })),
  };
}

function livex(entries: Array<[string, number]>): LivexPoint[] {
  return entries.map(([d, indexValue]) => ({
    date: new Date(d),
    indexValue,
  }));
}

describe("computePortfolioValueAt", () => {
  it("sums nearest-preceding valuation per bottle", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 100, [
        ["2024-06-01", 150],
        ["2025-06-01", 200],
      ]),
      wine("2024-01-01", 500, [["2025-01-01", 600]]),
    ];
    // On 2025-07-01: wine A's nearest-preceding is 200; B's is 600.
    expect(computePortfolioValueAt(wines, new Date("2025-07-01"))).toBe(800);
  });

  it("falls back to purchase price when no valuation precedes the date", () => {
    const wines: TimeseriesWine[] = [
      wine("2025-01-01", 100, [["2025-06-01", 200]]),
    ];
    // On 2025-03-01 the 2025-06-01 valuation is in the future — fall
    // back to the $100 purchase price.
    expect(computePortfolioValueAt(wines, new Date("2025-03-01"))).toBe(100);
  });

  it("skips bottles acquired after the target date", () => {
    const wines: TimeseriesWine[] = [
      wine("2026-03-01", 100, [["2026-03-15", 150]]),
    ];
    // Bottle didn't exist at 2026-01-01 — contributes zero.
    expect(computePortfolioValueAt(wines, new Date("2026-01-01"))).toBe(0);
  });

  it("returns 0 for an empty portfolio", () => {
    expect(computePortfolioValueAt([], new Date("2026-04-01"))).toBe(0);
  });
});

describe("buildPortfolioVsLivexSeries", () => {
  // Seed Liv-ex points matching the pattern in prisma/seed.ts — monthly,
  // UTC midnight on the 1st. YTD 2026 Jan→Apr has 4 points.
  const livex2024_to_2026 = livex([
    ["2025-05-01", 340],
    ["2025-06-01", 342],
    ["2025-07-01", 341],
    ["2025-08-01", 343],
    ["2025-09-01", 344],
    ["2025-10-01", 346],
    ["2025-11-01", 348],
    ["2025-12-01", 350],
    ["2026-01-01", 353],
    ["2026-02-01", 355],
    ["2026-03-01", 358],
    ["2026-04-01", 361],
  ]);

  it("indexes both series to 100 at the YTD anchor", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [
        ["2025-06-01", 2000],
        ["2026-01-01", 2200],
        ["2026-03-01", 2300],
      ]),
    ];
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-04-21"),
    });
    expect(series.windowType).toBe("ytd");
    expect(series.points.length).toBe(4);
    // First point is the anchor → both sides at exactly 100.
    expect(series.points[0]!.portfolio).toBe(100);
    expect(series.points[0]!.livex).toBe(100);
    // Liv-ex Apr = 361 / Jan = 353 → ~102.27
    expect(series.points[3]!.livex).toBeCloseTo(102.27, 1);
    // Liv-ex YTD percent surfaces on the summary.
    expect(series.livexChangePct).toBeCloseTo(2.27, 1);
  });

  it("excludes bottles acquired after the anchor date (Option A)", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [
        ["2026-01-01", 1000],
        ["2026-04-01", 1200],
      ]),
      // Added Feb 1 — must NOT retroactively push up the Jan anchor or
      // contribute to later samples for YTD comparability.
      wine("2026-02-01", 500, [
        ["2026-02-01", 500],
        ["2026-04-01", 800],
      ]),
    ];
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-04-21"),
    });
    expect(series.points[0]!.portfolioUsd).toBe(1000);
    // Apr portfolio should only reflect the first bottle ($1200), not
    // the mid-year addition.
    expect(series.points[3]!.portfolioUsd).toBe(1200);
    expect(series.portfolioChangePct).toBeCloseTo(20, 1);
  });

  it("computes the delta (portfolio − livex) in percentage points", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [
        ["2026-01-01", 1000],
        ["2026-04-01", 1100], // +10% YTD
      ]),
    ];
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-04-21"),
    });
    // Portfolio +10%, Liv-ex +2.27% → delta ~+7.7 pts
    expect(series.deltaPct).not.toBeNull();
    expect(series.deltaPct!).toBeCloseTo(7.73, 1);
  });

  it("falls back to trailing-12-month when YTD has fewer than MIN_YTD_POINTS", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [
        ["2025-06-01", 1100],
        ["2026-01-01", 1150],
      ]),
    ];
    // On Jan 15 there's only one YTD Liv-ex point (Jan 1). YTD falls
    // below MIN_YTD_POINTS so we draw trailing 12 months instead.
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-01-15"),
    });
    expect(MIN_YTD_POINTS).toBe(3);
    expect(series.windowType).toBe("trailing_12m");
    // Trailing 12m from 2025-01-15 → 2026-01-15 captures multiple points.
    expect(series.points.length).toBeGreaterThan(MIN_YTD_POINTS);
  });

  it("returns an empty series when the portfolio's anchor value is zero", () => {
    // Bottle created after the anchor — no holdings at Jan 1.
    const wines: TimeseriesWine[] = [
      wine("2026-03-01", 500, [["2026-04-01", 800]]),
    ];
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-04-21"),
    });
    expect(series.points).toEqual([]);
    expect(series.deltaPct).toBeNull();
  });

  it("returns an empty series when Liv-ex has no data", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [["2026-04-01", 1100]]),
    ];
    const series = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: [],
      now: new Date("2026-04-21"),
    });
    expect(series.points).toEqual([]);
    expect(series.anchorDate).toBeNull();
  });

  it("uses plain month labels in YTD and month+year in trailing-12m", () => {
    const wines: TimeseriesWine[] = [
      wine("2024-01-01", 1000, [["2025-06-01", 1100]]),
    ];
    const ytd = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-04-21"),
    });
    expect(ytd.points[0]!.label).toBe("Jan");

    const trailing = buildPortfolioVsLivexSeries({
      wines,
      livexPoints: livex2024_to_2026,
      now: new Date("2026-01-15"),
    });
    // Trailing 12m labels include the two-digit year to disambiguate
    // the repeated month across the window.
    expect(trailing.points[0]!.label).toMatch(/\b2[56]$/);
  });
});
