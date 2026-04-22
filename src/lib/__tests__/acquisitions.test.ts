import { describe, it, expect } from "vitest";
import { AcquisitionStatus } from "@prisma/client";
import {
  canTransitionAcquisition,
  computeMargin,
  formatAcquisitionSpec,
  formatVintage,
  isMemberCancellable,
  MAX_BOTTLES_PER_REQUEST,
  TARGET_MARGIN_PCT_HIGH,
  TARGET_MARGIN_PCT_LOW,
} from "../acquisitions";

describe("canTransitionAcquisition", () => {
  const S = AcquisitionStatus;

  it("requested → sourcing | declined | cancelled only", () => {
    expect(canTransitionAcquisition(S.requested, S.sourcing)).toBe(true);
    expect(canTransitionAcquisition(S.requested, S.declined)).toBe(true);
    expect(canTransitionAcquisition(S.requested, S.cancelled)).toBe(true);
    expect(canTransitionAcquisition(S.requested, S.fulfilled)).toBe(false);
    expect(canTransitionAcquisition(S.requested, S.requested)).toBe(false);
  });

  it("sourcing → fulfilled | declined | cancelled only, no reverse", () => {
    expect(canTransitionAcquisition(S.sourcing, S.fulfilled)).toBe(true);
    expect(canTransitionAcquisition(S.sourcing, S.declined)).toBe(true);
    expect(canTransitionAcquisition(S.sourcing, S.cancelled)).toBe(true);
    expect(canTransitionAcquisition(S.sourcing, S.requested)).toBe(false);
    expect(canTransitionAcquisition(S.sourcing, S.sourcing)).toBe(false);
  });

  it("terminal states stay terminal", () => {
    for (const terminal of [S.fulfilled, S.declined, S.cancelled]) {
      for (const to of [
        S.requested,
        S.sourcing,
        S.fulfilled,
        S.declined,
        S.cancelled,
      ]) {
        expect(canTransitionAcquisition(terminal, to)).toBe(false);
      }
    }
  });
});

describe("isMemberCancellable", () => {
  it("lets the member cancel while the request is still in-flight", () => {
    expect(isMemberCancellable(AcquisitionStatus.requested)).toBe(true);
    expect(isMemberCancellable(AcquisitionStatus.sourcing)).toBe(true);
  });

  it("blocks cancellation after a terminal state", () => {
    expect(isMemberCancellable(AcquisitionStatus.fulfilled)).toBe(false);
    expect(isMemberCancellable(AcquisitionStatus.declined)).toBe(false);
    expect(isMemberCancellable(AcquisitionStatus.cancelled)).toBe(false);
  });
});

describe("computeMargin", () => {
  it("returns the margin as member price minus cost", () => {
    const r = computeMargin({ actualCostUsd: 650, memberPriceUsd: 720 });
    expect(r.marginUsd).toBe(70);
    expect(r.marginPct).toBeCloseTo(9.72, 2);
  });

  it("flags a margin inside the 8–12% target band", () => {
    // 10% margin exactly
    const r = computeMargin({ actualCostUsd: 900, memberPriceUsd: 1000 });
    expect(r.marginPct).toBe(10);
    expect(r.withinTargetBand).toBe(true);
    expect(TARGET_MARGIN_PCT_LOW).toBe(8);
    expect(TARGET_MARGIN_PCT_HIGH).toBe(12);
  });

  it("flags under/over-band margins as out of band", () => {
    // 5% — too low
    const low = computeMargin({ actualCostUsd: 950, memberPriceUsd: 1000 });
    expect(low.withinTargetBand).toBe(false);
    // 15% — too high
    const high = computeMargin({ actualCostUsd: 850, memberPriceUsd: 1000 });
    expect(high.withinTargetBand).toBe(false);
  });

  it("handles negative margin (staff sold below cost) cleanly", () => {
    const r = computeMargin({ actualCostUsd: 1100, memberPriceUsd: 1000 });
    expect(r.marginUsd).toBe(-100);
    expect(r.marginPct).toBe(-10);
    expect(r.withinTargetBand).toBe(false);
  });

  it("returns null margin percent when member price is zero", () => {
    const r = computeMargin({ actualCostUsd: 0, memberPriceUsd: 0 });
    expect(r.marginUsd).toBe(0);
    expect(r.marginPct).toBeNull();
    expect(r.withinTargetBand).toBe(false);
  });
});

describe("formatVintage", () => {
  it("formats an exact vintage as a single year", () => {
    expect(
      formatVintage({
        vintageExact: 2015,
        vintageMin: null,
        vintageMax: null,
      }),
    ).toBe("2015");
  });

  it("formats a range as min–max", () => {
    expect(
      formatVintage({
        vintageExact: null,
        vintageMin: 2015,
        vintageMax: 2016,
      }),
    ).toBe("2015–2016");
  });

  it("collapses a same-min-same-max range to one year", () => {
    expect(
      formatVintage({
        vintageExact: null,
        vintageMin: 2015,
        vintageMax: 2015,
      }),
    ).toBe("2015");
  });

  it("formats an open-ended min as YYYY+", () => {
    expect(
      formatVintage({
        vintageExact: null,
        vintageMin: 2015,
        vintageMax: null,
      }),
    ).toBe("2015+");
  });

  it("formats an open-ended max as ≤YYYY", () => {
    expect(
      formatVintage({
        vintageExact: null,
        vintageMin: null,
        vintageMax: 2000,
      }),
    ).toBe("≤2000");
  });

  it("returns empty when no vintage info is provided", () => {
    expect(
      formatVintage({
        vintageExact: null,
        vintageMin: null,
        vintageMax: null,
      }),
    ).toBe("");
  });
});

describe("formatAcquisitionSpec", () => {
  it("puts vintage, producer, wine name, region, varietal, quantity on one line", () => {
    expect(
      formatAcquisitionSpec({
        producer: "Château Lafite Rothschild",
        wineName: null,
        vintageExact: 2010,
        vintageMin: null,
        vintageMax: null,
        region: "Pauillac",
        varietal: "Cabernet Sauvignon",
        quantity: 1,
      }),
    ).toBe(
      "2010 Château Lafite Rothschild — Pauillac · Cabernet Sauvignon × 1",
    );
  });

  it("joins producer + wineName when both present", () => {
    expect(
      formatAcquisitionSpec({
        producer: "Tenuta San Guido",
        wineName: "Sassicaia",
        vintageExact: 2019,
        vintageMin: null,
        vintageMax: null,
        region: null,
        varietal: null,
        quantity: 3,
      }),
    ).toBe("2019 Tenuta San Guido Sassicaia × 3");
  });

  it("uses the range vintage when exact is absent", () => {
    expect(
      formatAcquisitionSpec({
        producer: "Opus One",
        wineName: null,
        vintageExact: null,
        vintageMin: 2015,
        vintageMax: 2016,
        region: null,
        varietal: null,
        quantity: 2,
      }),
    ).toBe("2015–2016 Opus One × 2");
  });

  it("omits vintage cleanly when no years are set", () => {
    expect(
      formatAcquisitionSpec({
        producer: "Any Burgundy producer",
        wineName: null,
        vintageExact: null,
        vintageMin: null,
        vintageMax: null,
        region: "Côte de Nuits",
        varietal: null,
        quantity: 6,
      }),
    ).toBe("Any Burgundy producer — Côte de Nuits × 6");
  });
});

describe("MAX_BOTTLES_PER_REQUEST", () => {
  it("caps at a case (12 bottles)", () => {
    expect(MAX_BOTTLES_PER_REQUEST).toBe(12);
  });
});
