/**
 * Unit tests for the tool dispatcher (feature #50).
 *
 * The dispatcher isolates the route from the tool surface — verify that:
 *
 *   1. Every one of the seven tool names routes to the matching function.
 *   2. Unknown names surface as `{ ok: false, error }` instead of throws.
 *   3. AdvisorAuthError is caught and returned as `authentication_required`
 *      rather than propagating (so the chat route emits a clean tool_result
 *      instead of 500ing the whole stream).
 *   4. Zod param validation failures return structured errors.
 *
 * The tool functions themselves are mocked — full-depth behavior is
 * already covered by advisor-tools.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/advisor-tools", async () => {
  const { AdvisorAuthError } = await import("@/lib/advisor-tools");
  return {
    AdvisorAuthError,
    getMemberPortfolio: vi.fn(),
    getLivexPriceHistory: vi.fn(),
    getActiveAlerts: vi.fn(),
    getCCRList: vi.fn(),
    getTierDetails: vi.fn(),
    getWineDetail: vi.fn(),
    getLivexBenchmark: vi.fn(),
    getPortfolioVsLivex: vi.fn(),
    getExitSignals: vi.fn(),
    getInsuranceSavingsEstimate: vi.fn(),
  };
});

import * as tools from "@/lib/advisor-tools";
import { AdvisorAuthError } from "@/lib/advisor-tools";
import {
  ADVISOR_TOOL_DEFINITIONS,
  dispatchTool,
} from "@/lib/advisor-dispatch";

const WINE_ID = "00000000-0000-4000-8000-00000000a001";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ADVISOR_TOOL_DEFINITIONS", () => {
  it("registers exactly the ten member-scoped tools", () => {
    const names = ADVISOR_TOOL_DEFINITIONS.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "getActiveAlerts",
        "getCCRList",
        "getExitSignals",
        "getInsuranceSavingsEstimate",
        "getLivexBenchmark",
        "getLivexPriceHistory",
        "getMemberPortfolio",
        "getPortfolioVsLivex",
        "getTierDetails",
        "getWineDetail",
      ].sort(),
    );
  });

  it("every tool definition has a non-empty description", () => {
    for (const t of ADVISOR_TOOL_DEFINITIONS) {
      expect(typeof t.description).toBe("string");
      expect((t.description ?? "").length).toBeGreaterThan(20);
    }
  });

  it("getLivexPriceHistory and getWineDetail require wineId", () => {
    for (const name of ["getLivexPriceHistory", "getWineDetail"]) {
      const def = ADVISOR_TOOL_DEFINITIONS.find((t) => t.name === name);
      expect(def).toBeDefined();
      expect(def!.input_schema.required).toContain("wineId");
    }
  });
});

describe("dispatchTool — correct routing per tool name", () => {
  it("getMemberPortfolio → getMemberPortfolio()", async () => {
    (tools.getMemberPortfolio as ReturnType<typeof vi.fn>).mockResolvedValue({
      wines: [],
      totals: { totalValueUsd: 0, totalBasisUsd: 0, ytdChangePct: null },
    });
    const r = await dispatchTool("getMemberPortfolio", {});
    expect(r.ok).toBe(true);
    expect(tools.getMemberPortfolio).toHaveBeenCalledOnce();
  });

  it("getLivexPriceHistory → getLivexPriceHistory({wineId})", async () => {
    (tools.getLivexPriceHistory as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const r = await dispatchTool("getLivexPriceHistory", { wineId: WINE_ID });
    expect(r.ok).toBe(true);
    expect(tools.getLivexPriceHistory).toHaveBeenCalledWith({ wineId: WINE_ID });
  });

  it("getActiveAlerts → getActiveAlerts()", async () => {
    (tools.getActiveAlerts as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const r = await dispatchTool("getActiveAlerts", {});
    expect(r.ok).toBe(true);
    expect(tools.getActiveAlerts).toHaveBeenCalledOnce();
  });

  it("getCCRList → getCCRList()", async () => {
    (tools.getCCRList as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const r = await dispatchTool("getCCRList", {});
    expect(r.ok).toBe(true);
    expect(tools.getCCRList).toHaveBeenCalledOnce();
  });

  it("getTierDetails → getTierDetails()", async () => {
    (tools.getTierDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: "estate",
      name: "Estate",
    });
    const r = await dispatchTool("getTierDetails", {});
    expect(r.ok).toBe(true);
    expect(tools.getTierDetails).toHaveBeenCalledOnce();
  });

  it("getWineDetail → getWineDetail({wineId})", async () => {
    (tools.getWineDetail as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const r = await dispatchTool("getWineDetail", { wineId: WINE_ID });
    expect(r.ok).toBe(true);
    expect(tools.getWineDetail).toHaveBeenCalledWith({ wineId: WINE_ID });
  });

  it("getLivexBenchmark → getLivexBenchmark({since?})", async () => {
    (tools.getLivexBenchmark as ReturnType<typeof vi.fn>).mockResolvedValue({
      points: [],
      latestValue: null,
      ytdChangePct: null,
      oneYearChangePct: null,
    });
    const r = await dispatchTool("getLivexBenchmark", {});
    expect(r.ok).toBe(true);
    expect(tools.getLivexBenchmark).toHaveBeenCalledOnce();
  });

  it("getLivexBenchmark accepts null input (no args) gracefully", async () => {
    (tools.getLivexBenchmark as ReturnType<typeof vi.fn>).mockResolvedValue({
      points: [],
      latestValue: null,
      ytdChangePct: null,
      oneYearChangePct: null,
    });
    const r = await dispatchTool("getLivexBenchmark", null);
    expect(r.ok).toBe(true);
  });

  it("getPortfolioVsLivex → getPortfolioVsLivex()", async () => {
    (
      tools.getPortfolioVsLivex as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      windowType: "ytd",
      anchorDate: null,
      asOf: new Date().toISOString(),
      portfolioChangePct: null,
      livexChangePct: null,
      deltaPct: null,
      points: [],
    });
    const r = await dispatchTool("getPortfolioVsLivex", {});
    expect(r.ok).toBe(true);
    expect(tools.getPortfolioVsLivex).toHaveBeenCalledOnce();
  });

  it("getExitSignals → getExitSignals()", async () => {
    (tools.getExitSignals as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const r = await dispatchTool("getExitSignals", {});
    expect(r.ok).toBe(true);
    expect(tools.getExitSignals).toHaveBeenCalledOnce();
  });

  it("getInsuranceSavingsEstimate → getInsuranceSavingsEstimate()", async () => {
    (
      tools.getInsuranceSavingsEstimate as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      collectionValueUsd: 0,
      tier: { slug: "collector", name: "Collector" },
      savingsRangeUsd: { low: 0, high: 0 },
      discountPct: { low: 0.15, high: 0.25 },
      baselinePremiumUsd: { low: 0, high: 0 },
      partners: [],
      disciplineBullets: [],
    });
    const r = await dispatchTool("getInsuranceSavingsEstimate", {});
    expect(r.ok).toBe(true);
    expect(tools.getInsuranceSavingsEstimate).toHaveBeenCalledOnce();
  });
});

describe("dispatchTool — unknown tool names", () => {
  it("rejects unknown tool names without calling any tool function", async () => {
    const r = await dispatchTool("deleteAllWines", {});
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toMatch(/unknown tool/i);
      expect(r.error).toContain("deleteAllWines");
    }
    expect(tools.getMemberPortfolio).not.toHaveBeenCalled();
    expect(tools.getWineDetail).not.toHaveBeenCalled();
  });

  it("rejects empty and whitespace names", async () => {
    const r1 = await dispatchTool("", {});
    expect(r1.ok).toBe(false);
    const r2 = await dispatchTool("   ", {});
    expect(r2.ok).toBe(false);
  });
});

describe("dispatchTool — error surfacing", () => {
  it("returns authentication_required (not throw) when tool throws AdvisorAuthError", async () => {
    (tools.getMemberPortfolio as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AdvisorAuthError(),
    );
    const r = await dispatchTool("getMemberPortfolio", {});
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toBe("authentication_required");
    }
  });

  it("returns structured error (not throw) when tool throws generic Error", async () => {
    (tools.getWineDetail as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Wine not found"),
    );
    const r = await dispatchTool("getWineDetail", { wineId: WINE_ID });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toBe("Wine not found");
    }
  });

  it("returns Zod validation error when wineId is not a UUID", async () => {
    const r = await dispatchTool("getWineDetail", { wineId: "not-a-uuid" });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.error).toMatch(/invalid id/i);
    }
    // Should never call the tool if param validation fails
    expect(tools.getWineDetail).not.toHaveBeenCalled();
  });

  it("returns Zod validation error when required param is missing", async () => {
    const r = await dispatchTool("getLivexPriceHistory", {});
    expect(r.ok).toBe(false);
    expect(tools.getLivexPriceHistory).not.toHaveBeenCalled();
  });
});
