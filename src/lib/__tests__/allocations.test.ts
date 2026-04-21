import { describe, it, expect } from "vitest";
import {
  AllocationRequestStatus,
  AllocationStatus,
  Tier,
} from "@prisma/client";
import {
  bottlesClaimed,
  bottlesRemaining,
  canTransitionRequest,
  decideEligibility,
  isEligible,
  isOpenForRequests,
  maxRequestQuantity,
  MAX_BOTTLES_PER_REQUEST,
} from "../allocations";
import { TIER_RANK, tierAtLeast } from "../tiers";

const NOW = new Date("2026-04-21T12:00:00.000Z");
const PAST = new Date("2026-04-20T12:00:00.000Z");
const FUTURE = new Date("2026-05-21T12:00:00.000Z");
const FAR_FUTURE = new Date("2026-06-30T12:00:00.000Z");

function allocation(overrides: Partial<{
  status: AllocationStatus;
  minimumTier: Tier;
  foundingOnly: boolean;
  foundingEarlyAccess: boolean;
  opensAt: Date;
  closesAt: Date;
  quantity: number;
}>) {
  return {
    status: overrides.status ?? AllocationStatus.published,
    minimumTier: overrides.minimumTier ?? Tier.platinum,
    foundingOnly: overrides.foundingOnly ?? false,
    foundingEarlyAccess: overrides.foundingEarlyAccess ?? false,
    opensAt: overrides.opensAt ?? PAST,
    closesAt: overrides.closesAt ?? FUTURE,
    quantity: overrides.quantity ?? 5,
  };
}

describe("TIER_RANK", () => {
  it("orders Collector < Reserve < Private Vault < Estate", () => {
    expect(TIER_RANK[Tier.gold]).toBe(0);
    expect(TIER_RANK[Tier.reserve]).toBe(1);
    expect(TIER_RANK[Tier.platinum]).toBe(2);
    expect(TIER_RANK[Tier.black]).toBe(3);
  });

  it("tierAtLeast is reflexive, transitive, and strict upward", () => {
    expect(tierAtLeast(Tier.black, Tier.black)).toBe(true);
    expect(tierAtLeast(Tier.black, Tier.gold)).toBe(true);
    expect(tierAtLeast(Tier.platinum, Tier.reserve)).toBe(true);
    expect(tierAtLeast(Tier.gold, Tier.reserve)).toBe(false);
    expect(tierAtLeast(Tier.reserve, Tier.platinum)).toBe(false);
  });
});

describe("decideEligibility", () => {
  it("rejects when the allocation is still a draft", () => {
    const d = decideEligibility(
      { tier: Tier.black, foundingMember: true },
      allocation({ status: AllocationStatus.draft }),
      NOW,
    );
    expect(d.eligible).toBe(false);
  });

  it("rejects when tier floor is above the member's tier", () => {
    const d = decideEligibility(
      { tier: Tier.reserve, foundingMember: false },
      allocation({ minimumTier: Tier.black }),
      NOW,
    );
    expect(d.eligible).toBe(false);
    expect(d.reason).toMatch(/Estate/);
  });

  it("accepts when member's tier matches the floor exactly", () => {
    const d = decideEligibility(
      { tier: Tier.platinum, foundingMember: false },
      allocation({ minimumTier: Tier.platinum }),
      NOW,
    );
    expect(d.eligible).toBe(true);
  });

  it("founding-only rejects non-founding members at the right tier", () => {
    const d = decideEligibility(
      { tier: Tier.black, foundingMember: false },
      allocation({ foundingOnly: true, minimumTier: Tier.black }),
      NOW,
    );
    expect(d.eligible).toBe(false);
    expect(d.reason).toMatch(/Founding/);
  });

  it("founding-only accepts founding members at the right tier", () => {
    const d = decideEligibility(
      { tier: Tier.black, foundingMember: true },
      allocation({ foundingOnly: true, minimumTier: Tier.black }),
      NOW,
    );
    expect(d.eligible).toBe(true);
  });

  it("rejects after closesAt regardless of tier", () => {
    const d = decideEligibility(
      { tier: Tier.black, foundingMember: true },
      allocation({ closesAt: PAST }),
      NOW,
    );
    expect(d.eligible).toBe(false);
  });

  it("before opensAt, only founding + foundingEarlyAccess can see it", () => {
    const a = allocation({
      foundingEarlyAccess: true,
      opensAt: FUTURE,
      closesAt: FAR_FUTURE,
      minimumTier: Tier.platinum,
    });
    expect(
      decideEligibility(
        { tier: Tier.platinum, foundingMember: false },
        a,
        NOW,
      ).eligible,
    ).toBe(false);
    expect(
      decideEligibility(
        { tier: Tier.platinum, foundingMember: true },
        a,
        NOW,
      ).eligible,
    ).toBe(true);
  });

  it("before opensAt, no one sees a non-early-access release", () => {
    const a = allocation({
      foundingEarlyAccess: false,
      opensAt: FUTURE,
      closesAt: FAR_FUTURE,
      minimumTier: Tier.platinum,
    });
    expect(
      decideEligibility(
        { tier: Tier.black, foundingMember: true },
        a,
        NOW,
      ).eligible,
    ).toBe(false);
  });
});

describe("isEligible", () => {
  it("is the boolean shortcut for decideEligibility", () => {
    const a = allocation({});
    expect(
      isEligible({ tier: Tier.black, foundingMember: false }, a, NOW),
    ).toBe(true);
  });
});

describe("bottlesClaimed / bottlesRemaining / maxRequestQuantity", () => {
  it("counts accepted + fulfilled toward claimed, ignores pending and cancelled", () => {
    const reqs = [
      { status: AllocationRequestStatus.accepted, quantityRequested: 2 },
      { status: AllocationRequestStatus.fulfilled, quantityRequested: 1 },
      { status: AllocationRequestStatus.submitted, quantityRequested: 5 },
      { status: AllocationRequestStatus.cancelled, quantityRequested: 5 },
      { status: AllocationRequestStatus.declined, quantityRequested: 5 },
    ];
    expect(bottlesClaimed(reqs)).toBe(3);
    expect(bottlesRemaining({ quantity: 10 }, reqs)).toBe(7);
  });

  it("bottlesRemaining clamps to zero, never negative", () => {
    const reqs = [
      { status: AllocationRequestStatus.fulfilled, quantityRequested: 12 },
    ];
    expect(bottlesRemaining({ quantity: 10 }, reqs)).toBe(0);
  });

  it("maxRequestQuantity caps at the per-request limit and at remaining", () => {
    expect(maxRequestQuantity({ quantity: 10 }, [])).toBe(
      MAX_BOTTLES_PER_REQUEST,
    );
    expect(
      maxRequestQuantity({ quantity: 2 }, []),
    ).toBe(2);
    expect(
      maxRequestQuantity({ quantity: 1 }, [
        { status: AllocationRequestStatus.accepted, quantityRequested: 1 },
      ]),
    ).toBe(0);
  });
});

describe("canTransitionRequest", () => {
  const S = AllocationRequestStatus;
  it("submitted → accepted / declined / cancelled only", () => {
    expect(canTransitionRequest(S.submitted, S.accepted)).toBe(true);
    expect(canTransitionRequest(S.submitted, S.declined)).toBe(true);
    expect(canTransitionRequest(S.submitted, S.cancelled)).toBe(true);
    expect(canTransitionRequest(S.submitted, S.fulfilled)).toBe(false);
  });

  it("accepted → fulfilled / cancelled only (no reverse)", () => {
    expect(canTransitionRequest(S.accepted, S.fulfilled)).toBe(true);
    expect(canTransitionRequest(S.accepted, S.cancelled)).toBe(true);
    expect(canTransitionRequest(S.accepted, S.declined)).toBe(false);
    expect(canTransitionRequest(S.accepted, S.submitted)).toBe(false);
  });

  it("terminal states stay terminal", () => {
    for (const terminal of [S.fulfilled, S.declined, S.cancelled]) {
      for (const to of [
        S.submitted,
        S.accepted,
        S.declined,
        S.cancelled,
        S.fulfilled,
      ]) {
        expect(canTransitionRequest(terminal, to)).toBe(false);
      }
    }
  });
});

describe("isOpenForRequests", () => {
  it("open when published + not yet closed", () => {
    expect(
      isOpenForRequests(
        { status: AllocationStatus.published, closesAt: FUTURE },
        NOW,
      ),
    ).toBe(true);
  });

  it("closed after closesAt or when state changed", () => {
    expect(
      isOpenForRequests(
        { status: AllocationStatus.published, closesAt: PAST },
        NOW,
      ),
    ).toBe(false);
    expect(
      isOpenForRequests(
        { status: AllocationStatus.closed, closesAt: FUTURE },
        NOW,
      ),
    ).toBe(false);
    expect(
      isOpenForRequests(
        { status: AllocationStatus.draft, closesAt: FUTURE },
        NOW,
      ),
    ).toBe(false);
  });
});
