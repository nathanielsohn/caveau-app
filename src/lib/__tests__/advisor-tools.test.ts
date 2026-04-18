/**
 * Tests for the AI Advisor tool surface (feature #50).
 *
 * Three buckets:
 *
 *   1. Cross-member scoping — the jailbreak barrier. Authenticated as
 *      member A, a tool call referencing member B's wine ID must return
 *      nothing / throw. getMemberPortfolio must never return B's wines
 *      even when the underlying where clause is inspected.
 *
 *   2. Happy paths — one per tool, mocked to match the shape Robert
 *      Saenz's seeded data would produce. getLivexBenchmark's latestValue
 *      must resolve to 361.00 (the Apr 2026 seeded point) and
 *      getTierDetails must return the Estate spec (Tier.black).
 *
 *   3. Auth required — no session causes every tool to throw
 *      AdvisorAuthError with no DB interaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Tier } from "@prisma/client";

vi.mock("@/lib/auth", () => ({
  getServerAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wine: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    wineValuation: {
      findMany: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
    sensorReading: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    provenanceCertificate: {
      findMany: vi.fn(),
    },
    livexBenchmark: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  AdvisorAuthError,
  getMemberPortfolio,
  getLivexPriceHistory,
  getActiveAlerts,
  getCCRList,
  getTierDetails,
  getWineDetail,
  getLivexBenchmark,
} from "@/lib/advisor-tools";

const MEMBER_A = "00000000-0000-4000-8000-000000000aaa";
const MEMBER_B = "00000000-0000-4000-8000-000000000bbb";
const WINE_A1 = "00000000-0000-4000-8000-00000000a001";
const WINE_B1 = "00000000-0000-4000-8000-00000000b001";
const LOCKER_ID = "00000000-0000-4000-8000-0000000c0001";
const CERT_ID = "00000000-0000-4000-8000-0000000d0001";

function sessionAs(memberId: string, tier: Tier = Tier.black) {
  (getServerAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: {
      id: memberId,
      tier,
      role: "member",
      onboarded: true,
      name: "Test",
      email: "test@example.com",
    },
  });
}

function noSession() {
  (getServerAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 1. Cross-member scoping ────────────────────────────────────────────

describe("cross-member scoping (jailbreak barrier)", () => {
  it("getMemberPortfolio passes session.user.id as memberId — never trusts caller", async () => {
    sessionAs(MEMBER_A);
    (prisma.wine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getMemberPortfolio();

    expect(prisma.wine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: MEMBER_A }),
      }),
    );
    // Sanity: no call leaked member B's id
    const args = (prisma.wine.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(args.where.memberId).not.toBe(MEMBER_B);
  });

  it("getLivexPriceHistory throws when the wine belongs to another member", async () => {
    sessionAs(MEMBER_A);
    // The ownership findFirst returns null because (WINE_B1, memberId=A) doesn't exist
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      getLivexPriceHistory({ wineId: WINE_B1 }),
    ).rejects.toThrow(/not found/i);

    expect(prisma.wine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: WINE_B1,
          memberId: MEMBER_A,
        }),
      }),
    );
    // Never queries valuations without ownership proof
    expect(prisma.wineValuation.findMany).not.toHaveBeenCalled();
  });

  it("getWineDetail throws when the wine belongs to another member", async () => {
    sessionAs(MEMBER_A);
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      getWineDetail({ wineId: WINE_B1 }),
    ).rejects.toThrow(/not found/i);

    expect(prisma.wine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: WINE_B1,
          memberId: MEMBER_A,
        }),
      }),
    );
  });

  it("getActiveAlerts scopes the alert query through locker.memberId", async () => {
    sessionAs(MEMBER_A);
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getActiveAlerts();

    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          resolved: false,
          locker: expect.objectContaining({ memberId: MEMBER_A }),
        }),
      }),
    );
  });

  it("getCCRList scopes through wine.memberId", async () => {
    sessionAs(MEMBER_A);
    (prisma.provenanceCertificate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await getCCRList();

    expect(prisma.provenanceCertificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          wine: expect.objectContaining({ memberId: MEMBER_A }),
        }),
      }),
    );
  });
});

// ── 2. Happy paths ─────────────────────────────────────────────────────

describe("happy paths against seeded-shape data", () => {
  it("getMemberPortfolio returns wines + totals with coerced Decimals", async () => {
    sessionAs(MEMBER_A);
    const now = new Date();
    const eighteenMonthsAgo = new Date(now);
    eighteenMonthsAgo.setMonth(eighteenMonthsAgo.getMonth() - 18);
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    (prisma.wine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: WINE_A1,
        name: "Pétrus",
        producer: "Pétrus",
        vintage: 2018,
        region: "Bordeaux",
        varietal: "Merlot",
        purchasePrice: "5800",
        currentValue: "6413",
        drinkWindowStart: 2028,
        drinkWindowEnd: 2060,
        status: "in_cellar",
        createdAt: eighteenMonthsAgo,
        lockerSlots: [
          {
            locker: {
              lockerNumber: 7,
              zone: "A",
              facility: { name: "Caveau Naples" },
            },
          },
        ],
        valuations: [
          { date: eighteenMonthsAgo, price: "5800" },
          { date: twelveMonthsAgo, price: "6000" },
          { date: now, price: "6413" },
        ],
      },
      {
        id: "wine-a2",
        name: "Everyday Cab",
        producer: "Cheap Co",
        vintage: 2022,
        region: "Napa",
        varietal: "Cabernet Sauvignon",
        purchasePrice: "120",
        currentValue: "140",
        drinkWindowStart: null,
        drinkWindowEnd: null,
        status: "in_cellar",
        createdAt: now,
        lockerSlots: [],
        valuations: [],
      },
    ]);

    const portfolio = await getMemberPortfolio();

    expect(portfolio.wines).toHaveLength(2);
    expect(portfolio.totals.totalValueUsd).toBeCloseTo(6553, 2);
    expect(portfolio.totals.totalBasisUsd).toBeCloseTo(5920, 2);

    const petrus = portfolio.wines[0];
    expect(petrus!.id).toBe(WINE_A1);
    expect(petrus!.investmentGrade).toBe("investment");
    expect(petrus!.purchasePriceUsd).toBe(5800);
    expect(petrus!.currentValueUsd).toBe(6413);
    expect(petrus!.facilityName).toBe("Caveau Naples");
    expect(petrus!.lockerNumber).toBe(7);
    // CAGR: (6413/5800)^(1/1.5) - 1 ≈ 7.0%; floor to 1y -> 10.6%
    // Elapsed is 18 months so no floor kicks in; annualized growth is
    // between 6% and 8% depending on rounding.
    expect(petrus!.cagrPct).not.toBeNull();
    expect(petrus!.cagrPct!).toBeGreaterThan(0);
    expect(petrus!.oneYearChangePct).not.toBeNull();

    const everyday = portfolio.wines[1];
    expect(everyday!.investmentGrade).toBe("everyday");
    expect(everyday!.lockerNumber).toBeNull();
    // Single wine, single creation-time; CAGR should still be computable
    // because elapsed is floored at 1 year.
    expect(everyday!.cagrPct).not.toBeNull();
  });

  it("getLivexPriceHistory returns coerced + sorted Liv-ex valuations", async () => {
    sessionAs(MEMBER_A);
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: WINE_A1,
    });
    (prisma.wineValuation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { date: new Date("2026-01-01"), price: "6200", source: "liv-ex" },
      { date: new Date("2026-03-01"), price: "6413", source: "liv-ex" },
    ]);

    const history = await getLivexPriceHistory({ wineId: WINE_A1 });

    expect(history).toEqual([
      { date: new Date("2026-01-01").toISOString(), priceUsd: 6200, source: "liv-ex" },
      { date: new Date("2026-03-01").toISOString(), priceUsd: 6413, source: "liv-ex" },
    ]);
    // Ensures the source filter was applied at the query layer
    expect(prisma.wineValuation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ wineId: WINE_A1, source: "liv-ex" }),
      }),
    );
  });

  it("getActiveAlerts attaches the latest sensor reading per locker", async () => {
    sessionAs(MEMBER_A);
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "alert-1",
        lockerId: LOCKER_ID,
        type: "humidity",
        severity: "warning",
        message: "Humidity low: 53.2%",
        timestamp: new Date("2026-04-17T00:00:00Z"),
        locker: {
          id: LOCKER_ID,
          lockerNumber: 7,
          zone: "A",
          facility: { name: "Caveau Naples" },
        },
      },
    ]);
    const latestTs = new Date("2026-04-17T00:05:00Z");
    (prisma.sensorReading.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { lockerId: LOCKER_ID, _max: { timestamp: latestTs } },
    ]);
    (prisma.sensorReading.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        lockerId: LOCKER_ID,
        temperature: "55.1",
        humidity: "53.2",
        vibration: "0.12",
        timestamp: latestTs,
      },
    ]);

    const alerts = await getActiveAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.lockerNumber).toBe(7);
    expect(alerts[0]!.facilityName).toBe("Caveau Naples");
    expect(alerts[0]!.latestReading?.humidity).toBe(53.2);
    expect(alerts[0]!.thresholds.humidityMinPct).toBe(55);
  });

  it("getCCRList composes verification URLs from NEXTAUTH_URL", async () => {
    const priorNextAuthUrl = process.env.NEXTAUTH_URL;
    process.env.NEXTAUTH_URL = "https://app.caveau.ai";
    try {
      sessionAs(MEMBER_A);
      (prisma.provenanceCertificate.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: CERT_ID,
          certificateNumber: "CAV-2026-0001",
          monitoringStart: new Date("2025-10-01"),
          monitoringEnd: new Date("2026-04-01"),
          dataIntegrityHash: "abc123",
          revokedAt: null,
          wine: { name: "Pétrus", producer: "Pétrus", vintage: 2018 },
          locker: {
            lockerNumber: 7,
            zone: "A",
            facility: { name: "Caveau Naples" },
          },
        },
      ]);

      const ccrs = await getCCRList();

      expect(ccrs).toHaveLength(1);
      expect(ccrs[0]!.certificateNumber).toBe("CAV-2026-0001");
      expect(ccrs[0]!.wineName).toBe("Pétrus");
      expect(ccrs[0]!.lockerName).toBe("Caveau Naples — Locker #7 (A)");
      expect(ccrs[0]!.verificationUrl).toBe("https://app.caveau.ai/verify/abc123");
      expect(ccrs[0]!.revoked).toBe(false);
    } finally {
      process.env.NEXTAUTH_URL = priorNextAuthUrl;
    }
  });

  it("getTierDetails returns the Estate spec for Tier.black (Robert Saenz)", async () => {
    sessionAs(MEMBER_A, Tier.black);
    const details = await getTierDetails();
    expect(details.slug).toBe("estate");
    expect(details.name).toBe("Estate");
    expect(details.priceDisplay).toBe("$999/mo");
    expect(details.hurricaneProtection).toBe("included");
    expect(details.includedServices.length).toBeGreaterThan(0);
  });

  it("getWineDetail returns valuations + CCRs + dispositions + latest reading", async () => {
    sessionAs(MEMBER_A);
    const now = new Date();
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: WINE_A1,
      name: "Pétrus",
      producer: "Pétrus",
      vintage: 2018,
      region: "Bordeaux",
      varietal: "Merlot",
      purchasePrice: "5800",
      currentValue: "6413",
      tastingNotes: "Truffle, black cherry",
      drinkWindowStart: 2028,
      drinkWindowEnd: 2060,
      status: "in_cellar",
      createdAt: now,
      lockerSlots: [
        {
          locker: {
            id: LOCKER_ID,
            lockerNumber: 7,
            zone: "A",
            facility: { name: "Caveau Naples" },
          },
        },
      ],
      valuations: [
        { id: "v1", source: "liv-ex", price: "6413", date: now },
      ],
      certificates: [
        {
          id: CERT_ID,
          certificateNumber: "CAV-2026-0001",
          monitoringStart: now,
          monitoringEnd: now,
          dataIntegrityHash: "xyz789",
          revokedAt: null,
        },
      ],
      dispositions: [],
    });
    (prisma.sensorReading.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      temperature: "55.0",
      humidity: "65.0",
      vibration: "0.05",
      lightLux: "0.2",
      timestamp: now,
    });

    const detail = await getWineDetail({ wineId: WINE_A1 });

    expect(detail.id).toBe(WINE_A1);
    expect(detail.name).toBe("Pétrus");
    expect(detail.currentValueUsd).toBe(6413);
    expect(detail.lockerNumber).toBe(7);
    expect(detail.facilityName).toBe("Caveau Naples");
    expect(detail.valuations).toHaveLength(1);
    expect(detail.certificates).toHaveLength(1);
    expect(detail.certificates[0]!.certificateNumber).toBe("CAV-2026-0001");
    expect(detail.latestReading?.temperature).toBe(55.0);
  });

  it("getLivexBenchmark returns 361.00 as the latest seeded value", async () => {
    sessionAs(MEMBER_A);
    const seeded = [
      { year: 2024, month: 4, indexValue: 350 },
      { year: 2024, month: 5, indexValue: 345 },
      { year: 2024, month: 6, indexValue: 340 },
      { year: 2024, month: 7, indexValue: 338 },
      { year: 2024, month: 8, indexValue: 335 },
      { year: 2024, month: 9, indexValue: 332 },
      { year: 2024, month: 10, indexValue: 330 },
      { year: 2024, month: 11, indexValue: 329 },
      { year: 2024, month: 12, indexValue: 328 },
      { year: 2025, month: 1, indexValue: 331 },
      { year: 2025, month: 2, indexValue: 333 },
      { year: 2025, month: 3, indexValue: 336 },
      { year: 2025, month: 4, indexValue: 338 },
      { year: 2025, month: 5, indexValue: 340 },
      { year: 2025, month: 6, indexValue: 342 },
      { year: 2025, month: 7, indexValue: 341 },
      { year: 2025, month: 8, indexValue: 343 },
      { year: 2025, month: 9, indexValue: 344 },
      { year: 2025, month: 10, indexValue: 346 },
      { year: 2025, month: 11, indexValue: 348 },
      { year: 2025, month: 12, indexValue: 350 },
      { year: 2026, month: 1, indexValue: 353 },
      { year: 2026, month: 2, indexValue: 355 },
      { year: 2026, month: 3, indexValue: 358 },
      { year: 2026, month: 4, indexValue: 361 },
    ].map((p) => ({
      id: `seed-${p.year}-${p.month}`,
      date: new Date(Date.UTC(p.year, p.month - 1, 1)),
      indexValue: String(p.indexValue),
      createdAt: new Date(),
    }));
    (prisma.livexBenchmark.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(seeded);

    const benchmark = await getLivexBenchmark();

    expect(benchmark.points.length).toBe(25);
    expect(benchmark.latestValue).toBe(361);
    expect(benchmark.ytdChangePct).not.toBeNull();
    expect(benchmark.oneYearChangePct).not.toBeNull();
    // 1-year change Apr 2025 (338) -> Apr 2026 (361) ≈ +6.8%
    expect(benchmark.oneYearChangePct!).toBeGreaterThan(5);
    expect(benchmark.oneYearChangePct!).toBeLessThan(10);
  });
});

// ── 3. Auth required — every tool throws AdvisorAuthError ──────────────

describe("auth required — no session throws AdvisorAuthError", () => {
  it.each([
    ["getMemberPortfolio", () => getMemberPortfolio()],
    ["getLivexPriceHistory", () => getLivexPriceHistory({ wineId: WINE_A1 })],
    ["getActiveAlerts", () => getActiveAlerts()],
    ["getCCRList", () => getCCRList()],
    ["getTierDetails", () => getTierDetails()],
    ["getWineDetail", () => getWineDetail({ wineId: WINE_A1 })],
    ["getLivexBenchmark", () => getLivexBenchmark()],
  ])("%s throws AdvisorAuthError without a session", async (_name, invoke) => {
    noSession();
    await expect(invoke()).rejects.toBeInstanceOf(AdvisorAuthError);
    // No DB query should have fired
    expect(prisma.wine.findMany).not.toHaveBeenCalled();
    expect(prisma.wine.findFirst).not.toHaveBeenCalled();
    expect(prisma.wineValuation.findMany).not.toHaveBeenCalled();
    expect(prisma.alert.findMany).not.toHaveBeenCalled();
    expect(prisma.provenanceCertificate.findMany).not.toHaveBeenCalled();
    expect(prisma.livexBenchmark.findMany).not.toHaveBeenCalled();
  });
});
