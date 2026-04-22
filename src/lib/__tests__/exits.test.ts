import { describe, it, expect } from "vitest";
import { ExitChannel, ExitStatus } from "@prisma/client";
import {
  canTransitionExit,
  CHANNEL_LABELS,
  computeCommission,
  defaultCommissionPct,
  formatChannelWithHouse,
  isMemberCancellable,
  isTerminal,
  TARGET_COMMISSION_PCT_HIGH,
  TARGET_COMMISSION_PCT_LOW,
} from "../exits";

describe("canTransitionExit", () => {
  const S = ExitStatus;

  it("requested → listed | withdrawn | cancelled only", () => {
    expect(canTransitionExit(S.requested, S.listed)).toBe(true);
    expect(canTransitionExit(S.requested, S.withdrawn)).toBe(true);
    expect(canTransitionExit(S.requested, S.cancelled)).toBe(true);
    expect(canTransitionExit(S.requested, S.sold)).toBe(false);
    expect(canTransitionExit(S.requested, S.requested)).toBe(false);
  });

  it("listed → sold | withdrawn only — member cannot cancel a live lot", () => {
    expect(canTransitionExit(S.listed, S.sold)).toBe(true);
    expect(canTransitionExit(S.listed, S.withdrawn)).toBe(true);
    expect(canTransitionExit(S.listed, S.cancelled)).toBe(false);
    expect(canTransitionExit(S.listed, S.requested)).toBe(false);
    expect(canTransitionExit(S.listed, S.listed)).toBe(false);
  });

  it("terminal states stay terminal", () => {
    for (const terminal of [S.sold, S.withdrawn, S.cancelled]) {
      for (const to of [
        S.requested,
        S.listed,
        S.sold,
        S.withdrawn,
        S.cancelled,
      ]) {
        expect(canTransitionExit(terminal, to)).toBe(false);
      }
    }
  });
});

describe("isMemberCancellable", () => {
  it("lets the member cancel while requested", () => {
    expect(isMemberCancellable(ExitStatus.requested)).toBe(true);
  });

  it("blocks member cancellation once listed or terminal", () => {
    expect(isMemberCancellable(ExitStatus.listed)).toBe(false);
    expect(isMemberCancellable(ExitStatus.sold)).toBe(false);
    expect(isMemberCancellable(ExitStatus.withdrawn)).toBe(false);
    expect(isMemberCancellable(ExitStatus.cancelled)).toBe(false);
  });
});

describe("isTerminal", () => {
  it("marks sold / withdrawn / cancelled as terminal", () => {
    expect(isTerminal(ExitStatus.sold)).toBe(true);
    expect(isTerminal(ExitStatus.withdrawn)).toBe(true);
    expect(isTerminal(ExitStatus.cancelled)).toBe(true);
  });

  it("marks requested / listed as non-terminal", () => {
    expect(isTerminal(ExitStatus.requested)).toBe(false);
    expect(isTerminal(ExitStatus.listed)).toBe(false);
  });
});

describe("computeCommission", () => {
  it("returns commission = gross × pct / 100 and net = gross − commission", () => {
    const r = computeCommission({
      grossProceedsUsd: 10_000,
      commissionPct: 11,
    });
    expect(r.commissionUsd).toBe(1100);
    expect(r.netProceedsUsd).toBe(8900);
  });

  it("flags 10–12% as within the target band", () => {
    expect(
      computeCommission({ grossProceedsUsd: 5000, commissionPct: 10 })
        .withinTargetBand,
    ).toBe(true);
    expect(
      computeCommission({ grossProceedsUsd: 5000, commissionPct: 11 })
        .withinTargetBand,
    ).toBe(true);
    expect(
      computeCommission({ grossProceedsUsd: 5000, commissionPct: 12 })
        .withinTargetBand,
    ).toBe(true);
    expect(TARGET_COMMISSION_PCT_LOW).toBe(10);
    expect(TARGET_COMMISSION_PCT_HIGH).toBe(12);
  });

  it("flags under-band and over-band commissions as out of band", () => {
    expect(
      computeCommission({ grossProceedsUsd: 5000, commissionPct: 8 })
        .withinTargetBand,
    ).toBe(false);
    expect(
      computeCommission({ grossProceedsUsd: 5000, commissionPct: 15 })
        .withinTargetBand,
    ).toBe(false);
  });

  it("zero commission produces net equal to gross — self_handled invariant", () => {
    const r = computeCommission({
      grossProceedsUsd: 12_500,
      commissionPct: 0,
    });
    expect(r.commissionUsd).toBe(0);
    expect(r.netProceedsUsd).toBe(12_500);
    // Zero is outside the 10-12% band by design — the UI guards the
    // band check behind a channel !== self_handled condition.
    expect(r.withinTargetBand).toBe(false);
  });

  it("rounds to two decimals so DB decimal(14,2) never gets surprise trailing digits", () => {
    // 0.1 + 0.2 territory — picked a pct that triggers FP noise.
    const r = computeCommission({
      grossProceedsUsd: 3333.33,
      commissionPct: 11,
    });
    // Round-trip through Number.toFixed(2) ensures no `366.6663...`.
    expect(Number.isInteger(r.commissionUsd * 100)).toBe(true);
    expect(Number.isInteger(r.netProceedsUsd * 100)).toBe(true);
  });
});

describe("defaultCommissionPct", () => {
  it("auction + broker default to 11%, the mid of the 10-12 band", () => {
    expect(defaultCommissionPct(ExitChannel.auction)).toBe(11);
    expect(defaultCommissionPct(ExitChannel.broker)).toBe(11);
  });

  it("private_sale defaults lower — no third-party marketplace fee", () => {
    expect(defaultCommissionPct(ExitChannel.private_sale)).toBe(8);
  });

  it("self_handled is zero by contract", () => {
    expect(defaultCommissionPct(ExitChannel.self_handled)).toBe(0);
  });
});

describe("formatChannelWithHouse", () => {
  it("auction + house name returns 'Auction · <house>'", () => {
    expect(
      formatChannelWithHouse({
        channel: ExitChannel.auction,
        auctionHouseName: "Sotheby's",
      }),
    ).toBe("Auction · Sotheby's");
  });

  it("auction without house name returns bare channel label", () => {
    expect(
      formatChannelWithHouse({
        channel: ExitChannel.auction,
        auctionHouseName: null,
      }),
    ).toBe(CHANNEL_LABELS.auction);
  });

  it("non-auction channels ignore the house name field", () => {
    expect(
      formatChannelWithHouse({
        channel: ExitChannel.broker,
        auctionHouseName: "Sotheby's",
      }),
    ).toBe(CHANNEL_LABELS.broker);
  });

  it("null channel returns em-dash", () => {
    expect(
      formatChannelWithHouse({ channel: null, auctionHouseName: null }),
    ).toBe("—");
  });
});
