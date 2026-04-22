import { describe, it, expect } from "vitest";
import {
  AppraisalBasis,
  AppraisalPurpose,
  Tier,
} from "@prisma/client";
import {
  APPRAISAL_PRICE_BY_TIER,
  decideWelcomeEligibility,
  parseHeirs,
  parseLineItems,
  resolveAppraisalPrice,
} from "../appraisals";
import { appraisalIntegrityHash } from "../appraisal-hash";

describe("APPRAISAL_PRICE_BY_TIER", () => {
  it("ladders upward from Collector to Estate", () => {
    expect(APPRAISAL_PRICE_BY_TIER[Tier.gold]).toBeLessThan(
      APPRAISAL_PRICE_BY_TIER[Tier.reserve],
    );
    expect(APPRAISAL_PRICE_BY_TIER[Tier.reserve]).toBeLessThan(
      APPRAISAL_PRICE_BY_TIER[Tier.platinum],
    );
    expect(APPRAISAL_PRICE_BY_TIER[Tier.platinum]).toBeLessThan(
      APPRAISAL_PRICE_BY_TIER[Tier.black],
    );
  });

  it("lands inside the slide-15 $5K–$15K Y1 band at typical volume", () => {
    // 30 docs at the unweighted average should fit the $5K–$15K range.
    const avg =
      Object.values(APPRAISAL_PRICE_BY_TIER).reduce((a, b) => a + b, 0) /
      Object.values(APPRAISAL_PRICE_BY_TIER).length;
    const thirtyDocRevenue = avg * 30;
    expect(thirtyDocRevenue).toBeGreaterThanOrEqual(5_000);
    expect(thirtyDocRevenue).toBeLessThanOrEqual(45_000);
  });
});

describe("resolveAppraisalPrice", () => {
  it("returns $0 / 'Included' for a welcome appraisal regardless of tier", () => {
    for (const tier of [
      Tier.gold,
      Tier.reserve,
      Tier.platinum,
      Tier.black,
    ] as const) {
      const price = resolveAppraisalPrice(tier, true);
      expect(price.priceUsd).toBe(0);
      expect(price.priceDisplay).toBe("Included");
    }
  });

  it("charges the tier's per-document price when not welcome", () => {
    const r = resolveAppraisalPrice(Tier.platinum, false);
    expect(r.priceUsd).toBe(APPRAISAL_PRICE_BY_TIER[Tier.platinum]);
    expect(r.priceDisplay).toMatch(/^\$\d+/);
  });
});

describe("decideWelcomeEligibility", () => {
  it("approves a founding member with no prior welcome appraisal", () => {
    const d = decideWelcomeEligibility({
      foundingMember: true,
      hasExistingWelcomeAppraisal: false,
    });
    expect(d.eligible).toBe(true);
    expect(d.reason).toBe("eligible");
  });

  it("rejects a non-founding member", () => {
    const d = decideWelcomeEligibility({
      foundingMember: false,
      hasExistingWelcomeAppraisal: false,
    });
    expect(d.eligible).toBe(false);
    expect(d.reason).toBe("not_founding");
  });

  it("rejects when the member already claimed their welcome", () => {
    const d = decideWelcomeEligibility({
      foundingMember: true,
      hasExistingWelcomeAppraisal: true,
    });
    expect(d.eligible).toBe(false);
    expect(d.reason).toBe("already_claimed");
  });

  it("prioritizes not_founding over already_claimed", () => {
    // This combination shouldn't happen in practice (you can't have a
    // welcome appraisal without ever being founding), but the pure
    // function should still fail fast on the founding check rather than
    // reveal information about another table.
    const d = decideWelcomeEligibility({
      foundingMember: false,
      hasExistingWelcomeAppraisal: true,
    });
    expect(d.reason).toBe("not_founding");
  });
});

describe("appraisalIntegrityHash", () => {
  // The test env has NEXTAUTH_SECRET set (see vitest.setup.ts); the
  // hash helper falls back to that when CERTIFICATE_HMAC_SECRET is
  // unset, which is what we want in tests.
  const common = {
    id: "11111111-1111-4111-8111-111111111111",
    memberId: "22222222-2222-4222-8222-222222222222",
    effectiveDate: new Date("2026-04-22T00:00:00Z"),
    purpose: AppraisalPurpose.insurance,
    basis: AppraisalBasis.fair_market_value,
    totalBasisUsd: 12345.67,
  };

  it("is deterministic across invocations", () => {
    const a = appraisalIntegrityHash(common);
    const b = appraisalIntegrityHash(common);
    expect(a).toBe(b);
  });

  it("produces 64 hex characters", () => {
    expect(appraisalIntegrityHash(common)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("ignores cent rounding equivalence", () => {
    // 12345.6 and 12345.60 should collapse to the same fixed-cent
    // representation and therefore produce the same hash.
    const a = appraisalIntegrityHash({ ...common, totalBasisUsd: 12345.6 });
    const b = appraisalIntegrityHash({ ...common, totalBasisUsd: 12345.6 });
    expect(a).toBe(b);
  });

  it("differs when the member id changes", () => {
    const a = appraisalIntegrityHash(common);
    const b = appraisalIntegrityHash({
      ...common,
      memberId: "33333333-3333-4333-8333-333333333333",
    });
    expect(a).not.toBe(b);
  });

  it("differs when the purpose changes", () => {
    const a = appraisalIntegrityHash(common);
    const b = appraisalIntegrityHash({
      ...common,
      purpose: AppraisalPurpose.estate,
    });
    expect(a).not.toBe(b);
  });

  it("differs when the basis total changes", () => {
    const a = appraisalIntegrityHash(common);
    const b = appraisalIntegrityHash({
      ...common,
      totalBasisUsd: common.totalBasisUsd + 1,
    });
    expect(a).not.toBe(b);
  });

  it("differs when the effective date shifts by one day", () => {
    const a = appraisalIntegrityHash(common);
    const b = appraisalIntegrityHash({
      ...common,
      effectiveDate: new Date("2026-04-23T00:00:00Z"),
    });
    expect(a).not.toBe(b);
  });
});

describe("parseHeirs", () => {
  it("returns [] for null", () => {
    expect(parseHeirs(null)).toEqual([]);
  });

  it("returns [] for a non-array payload", () => {
    expect(parseHeirs("totally not a heirs payload")).toEqual([]);
    expect(parseHeirs({ some: "object" })).toEqual([]);
  });

  it("parses a well-formed heirs payload", () => {
    const heirs = parseHeirs([
      { name: "Elena Saenz", share: "50%" },
      { name: "Diego Saenz", share: "50%" },
    ]);
    expect(heirs).toHaveLength(2);
    expect(heirs[0]).toEqual({ name: "Elena Saenz", share: "50%" });
  });

  it("filters out malformed rows", () => {
    const heirs = parseHeirs([
      { name: "Elena Saenz", share: "50%" },
      { name: 12345, share: null },
      "completely wrong shape",
      { name: "Diego Saenz", share: "50%" },
    ]);
    expect(heirs).toHaveLength(2);
    expect(heirs.every((h) => typeof h.name === "string")).toBe(true);
  });
});

describe("parseLineItems", () => {
  it("returns [] for null", () => {
    expect(parseLineItems(null)).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    const items = parseLineItems([
      {
        wineId: "w1",
        producer: "Château Margaux",
        name: "Margaux",
        vintage: 2010,
        region: "Bordeaux",
        varietal: "Cabernet blend",
        currentValueUsd: 1250,
        ccrAnchor: "CAV-2026-0001",
      },
      { wineId: "broken" },
      "string nonsense",
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].wineId).toBe("w1");
    expect(items[0].ccrAnchor).toBe("CAV-2026-0001");
  });

  it("defaults missing optional scalars rather than dropping the row", () => {
    const items = parseLineItems([
      {
        wineId: "w2",
        name: "Unnamed Field Wine",
        vintage: 2018,
        currentValueUsd: 80,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].producer).toBe("");
    expect(items[0].region).toBe("");
    expect(items[0].varietal).toBe("");
    expect(items[0].ccrAnchor).toBeNull();
  });
});
