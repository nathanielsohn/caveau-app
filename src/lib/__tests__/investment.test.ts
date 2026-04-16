import { describe, it, expect } from "vitest";
import {
  classifyInvestmentTier,
  calculateCAGR,
  projectValue,
  tierLabel,
  tierBadgeClass,
  SP500_ANNUAL_RETURN,
  formatPercent,
} from "../investment";

describe("classifyInvestmentTier", () => {
  it("classifies Pétrus as icon", () => {
    expect(
      classifyInvestmentTier({ producer: "Pétrus", name: "Pétrus", vintage: 2018 }),
    ).toBe("icon");
  });

  it("classifies Screaming Eagle as icon", () => {
    expect(
      classifyInvestmentTier({
        producer: "Screaming Eagle",
        name: "Screaming Eagle Cabernet Sauvignon",
        vintage: 2019,
      }),
    ).toBe("icon");
  });

  it("classifies Harlan Estate as anchor", () => {
    expect(
      classifyInvestmentTier({
        producer: "Harlan Estate",
        name: "Harlan Estate",
        vintage: 2018,
      }),
    ).toBe("anchor");
  });

  it("classifies Château Latour as anchor across vintages", () => {
    expect(
      classifyInvestmentTier({
        producer: "Château Latour",
        name: "Château Latour",
        vintage: 2015,
      }),
    ).toBe("anchor");
    expect(
      classifyInvestmentTier({
        producer: "Château Latour",
        name: "Château Latour",
        vintage: 2010,
      }),
    ).toBe("anchor");
  });

  it("classifies DRC as blue-chip", () => {
    expect(
      classifyInvestmentTier({
        producer: "Domaine de la Romanée-Conti",
        name: "Nuits-Saint-Georges",
        vintage: 2019,
      }),
    ).toBe("blue-chip");
  });

  it("classifies Ridge Monte Bello as accessible but not Ridge Zinfandel", () => {
    expect(
      classifyInvestmentTier({
        producer: "Ridge Vineyards",
        name: "Ridge Monte Bello",
        vintage: 2018,
      }),
    ).toBe("accessible");
    expect(
      classifyInvestmentTier({
        producer: "Ridge Vineyards",
        name: "Ridge Lytton Springs Zinfandel",
        vintage: 2018,
      }),
    ).toBeNull();
  });

  it("classifies Caymus Special Selection only, not regular Caymus", () => {
    expect(
      classifyInvestmentTier({
        producer: "Caymus Vineyards",
        name: "Caymus Special Selection",
        vintage: 2019,
      }),
    ).toBe("approachable");
    expect(
      classifyInvestmentTier({
        producer: "Caymus Vineyards",
        name: "Caymus Cabernet Sauvignon",
        vintage: 2019,
      }),
    ).toBeNull();
  });

  it("returns null for non-investment-grade bottles", () => {
    expect(
      classifyInvestmentTier({
        producer: "Silver Oak",
        name: "Silver Oak Alexander Valley",
        vintage: 2018,
      }),
    ).toBeNull();
    expect(
      classifyInvestmentTier({
        producer: "Caveau Wines",
        name: "Caveau Napa Valley Cabernet Sauvignon",
        vintage: 2021,
      }),
    ).toBeNull();
  });
});

describe("calculateCAGR", () => {
  it("returns null for spans under 6 months", () => {
    const start = new Date("2026-01-01");
    const end = new Date("2026-03-01");
    expect(calculateCAGR(100, 120, start, end)).toBeNull();
  });

  it("returns null for zero or negative prices", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2026-01-01");
    expect(calculateCAGR(0, 100, start, end)).toBeNull();
    expect(calculateCAGR(100, 0, start, end)).toBeNull();
    expect(calculateCAGR(-50, 100, start, end)).toBeNull();
  });

  it("computes 10% CAGR over 1 year (100 → 110)", () => {
    const start = new Date("2025-01-01");
    const end = new Date("2026-01-01");
    const cagr = calculateCAGR(100, 110, start, end);
    expect(cagr).not.toBeNull();
    expect(cagr!).toBeCloseTo(0.1, 3);
  });

  it("computes ~7.18% CAGR over 5 years (100 → 141)", () => {
    const start = new Date("2021-01-01");
    const end = new Date("2026-01-01");
    const cagr = calculateCAGR(100, 141, start, end);
    expect(cagr!).toBeCloseTo(0.0712, 2);
  });

  it("computes negative CAGR for depreciation", () => {
    const start = new Date("2023-01-01");
    const end = new Date("2026-01-01");
    const cagr = calculateCAGR(100, 90, start, end);
    expect(cagr!).toBeLessThan(0);
  });

  it("returns null for invalid dates", () => {
    expect(calculateCAGR(100, 120, "not-a-date", new Date())).toBeNull();
  });
});

describe("projectValue", () => {
  it("applies compound growth over N years", () => {
    // $100 at 10%/yr for 5 years → $161.05
    expect(projectValue(100, 0.1, 5)).toBeCloseTo(161.05, 1);
  });

  it("caps absurdly high CAGR at 30%", () => {
    // 100% CAGR would give $3200 over 5 years; we cap at 30% → ~$371.29
    const uncapped = projectValue(100, 1.0, 5);
    expect(uncapped).toBeCloseTo(100 * Math.pow(1.3, 5), 1);
  });

  it("caps absurdly low CAGR at -20%", () => {
    const capped = projectValue(100, -0.5, 5);
    expect(capped).toBeCloseTo(100 * Math.pow(0.8, 5), 1);
  });

  it("defaults to 5-year horizon", () => {
    const five = projectValue(100, 0.1, 5);
    const defaultH = projectValue(100, 0.1);
    expect(defaultH).toBeCloseTo(five, 4);
  });
});

describe("tier display helpers", () => {
  it("returns a human label for every tier", () => {
    expect(tierLabel("icon")).toBe("Icon");
    expect(tierLabel("anchor")).toBe("Anchor");
    expect(tierLabel("blue-chip")).toBe("Blue-Chip");
    expect(tierLabel("prestige")).toBe("Prestige");
    expect(tierLabel("accessible")).toBe("Accessible");
    expect(tierLabel("approachable")).toBe("Approachable");
  });

  it("returns tailwind class string for every tier", () => {
    for (const tier of [
      "icon",
      "anchor",
      "blue-chip",
      "prestige",
      "accessible",
      "approachable",
    ] as const) {
      const cls = tierBadgeClass(tier);
      expect(cls).toMatch(/bg-/);
      expect(cls).toMatch(/text-/);
    }
  });
});

describe("SP500_ANNUAL_RETURN", () => {
  it("is 10% long-run nominal", () => {
    expect(SP500_ANNUAL_RETURN).toBe(0.1);
  });
});

describe("formatPercent", () => {
  it("adds plus sign for positive values", () => {
    expect(formatPercent(0.125)).toBe("+12.5%");
  });

  it("keeps minus sign for negative values", () => {
    expect(formatPercent(-0.08)).toBe("-8.0%");
  });

  it("honors decimals argument", () => {
    expect(formatPercent(0.12345, 2)).toBe("+12.35%");
  });
});
