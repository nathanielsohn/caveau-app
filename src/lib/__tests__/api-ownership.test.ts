/**
 * Regression tests for the audit-class "missing ownership scope" bug family.
 *
 * Each test mocks prisma + auth + facility context, invokes a route
 * handler, and asserts the handler passed the expected `memberId` (and,
 * where applicable, `facilityId`) down to prisma. If any handler ever
 * drops its scoping filter, exactly one of these assertions fails with a
 * name that points at the broken query.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ──────────────────────────────────────────────────────────────
//
// All prisma methods the routes call are stubbed with vi.fn so we can
// inspect the exact where-clause each handler builds. No catchalls —
// every stub is the specific method under test.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wine: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    wineValuation: {
      findMany: vi.fn(),
    },
    locker: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    sensorReading: {
      findMany: vi.fn(),
    },
    alert: {
      findMany: vi.fn(),
    },
    provenanceCertificate: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getServerAuth: vi.fn(),
}));

vi.mock("@/lib/current-facility", () => ({
  requireMemberFacility: vi.fn(),
  getCurrentFacility: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 30, resetAt: 0 }),
  clientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/s3", () => ({
  getPublicUrl: vi.fn().mockReturnValue(null),
  isS3Configured: vi.fn().mockReturnValue(false),
  getUploadUrl: vi.fn(),
  deleteObject: vi.fn(),
  extensionForType: vi.fn().mockReturnValue("jpg"),
  isAllowedImageType: vi.fn().mockReturnValue(true),
}));

// next/headers throws outside a request context; return a plain Headers
// so `clientIp(headers())` works without touching NextAuth internals.
vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { requireMemberFacility } from "@/lib/current-facility";

const MEMBER_ID = "00000000-0000-4000-8000-00000000aaaa";
const FACILITY_ID = "00000000-0000-4000-8000-00000000bbbb";
const WINE_ID = "00000000-0000-4000-8000-000000000001";
const LOCKER_ID = "00000000-0000-4000-8000-000000000002";
const CERT_ID = "00000000-0000-4000-8000-000000000003";

function withMember() {
  (getServerAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: MEMBER_ID },
  });
  (requireMemberFacility as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    memberId: MEMBER_ID,
    facilityId: FACILITY_ID,
  });
}

function withoutMember() {
  (getServerAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  (requireMemberFacility as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/wines ─────────────────────────────────────────────────────

describe("GET /api/wines", () => {
  it("returns 401 when the session is missing", async () => {
    withoutMember();
    const { GET } = await import("@/app/api/wines/route");
    const res = await GET(new NextRequest("http://localhost/api/wines"));
    expect(res.status).toBe(401);
    expect(prisma.wine.findMany).not.toHaveBeenCalled();
  });

  it("scopes to the authenticated member (memberId in WHERE)", async () => {
    withMember();
    (prisma.wine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/wines/route");
    await GET(new NextRequest("http://localhost/api/wines"));
    expect(prisma.wine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ memberId: MEMBER_ID }),
      }),
    );
  });

  it("keeps the memberId filter when a search term is supplied", async () => {
    withMember();
    (prisma.wine.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/wines/route");
    await GET(
      new NextRequest("http://localhost/api/wines?search=barolo&region=italy"),
    );
    const args = (prisma.wine.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(args.where.memberId).toBe(MEMBER_ID);
    // Filter survived alongside the search predicates
    expect(args.where).toHaveProperty("name");
    expect(args.where).toHaveProperty("region");
  });
});

// ── POST /api/wines ────────────────────────────────────────────────────

describe("POST /api/wines", () => {
  it("writes memberId onto the created row (never trusts the body)", async () => {
    withMember();
    (prisma.wine.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: WINE_ID,
      purchasePrice: 100,
      currentValue: 100,
    });
    const { POST } = await import("@/app/api/wines/route");
    await POST(
      new NextRequest("http://localhost/api/wines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Barolo",
          vintage: 2018,
          region: "Piedmont",
          varietal: "Nebbiolo",
          producer: "Test",
          purchasePrice: 100,
          // Attacker tries to inject a different memberId; must be ignored.
          memberId: "attacker",
        }),
      }),
    );
    expect(prisma.wine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ memberId: MEMBER_ID }),
      }),
    );
  });

  it("returns 401 when unauthenticated and never touches the DB", async () => {
    withoutMember();
    const { POST } = await import("@/app/api/wines/route");
    const res = await POST(
      new NextRequest("http://localhost/api/wines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "X",
          vintage: 2020,
          region: "X",
          varietal: "X",
          producer: "X",
          purchasePrice: 1,
        }),
      }),
    );
    expect(res.status).toBe(401);
    expect(prisma.wine.create).not.toHaveBeenCalled();
  });
});

// ── GET /api/wines/[id] ────────────────────────────────────────────────

describe("GET /api/wines/[id]", () => {
  it("filters the single-wine lookup by memberId", async () => {
    withMember();
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/wines/[id]/route");
    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: WINE_ID }),
    });
    expect(prisma.wine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: WINE_ID, memberId: MEMBER_ID }),
      }),
    );
  });
});

// ── GET /api/wines/[id]/valuations ─────────────────────────────────────

describe("GET /api/wines/[id]/valuations", () => {
  it("verifies wine ownership before listing valuations", async () => {
    withMember();
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: WINE_ID,
    });
    (prisma.wineValuation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/wines/[id]/valuations/route");
    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: WINE_ID }),
    });
    expect(prisma.wine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: WINE_ID, memberId: MEMBER_ID }),
      }),
    );
    // If the ownership pre-check were dropped, the list query would still
    // run — but crucially on the wrong member's data. This assertion makes
    // the pre-check mandatory.
    expect(prisma.wineValuation.findMany).toHaveBeenCalled();
  });

  it("returns 404 without querying valuations when the wine isn't owned", async () => {
    withMember();
    (prisma.wine.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/wines/[id]/valuations/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: WINE_ID }),
    });
    expect(res.status).toBe(404);
    expect(prisma.wineValuation.findMany).not.toHaveBeenCalled();
  });
});

// ── GET /api/lockers ───────────────────────────────────────────────────

describe("GET /api/lockers", () => {
  it("scopes lockers to memberId AND facilityId (no cross-facility leak)", async () => {
    withMember();
    (prisma.locker.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/lockers/route");
    await GET();
    expect(prisma.locker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: MEMBER_ID,
          facilityId: FACILITY_ID,
        }),
      }),
    );
  });
});

// ── GET /api/lockers/[id]/slots ────────────────────────────────────────

describe("GET /api/lockers/[id]/slots", () => {
  it("scopes the locker lookup by both memberId and facilityId", async () => {
    withMember();
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/lockers/[id]/slots/route");
    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: LOCKER_ID }),
    });
    expect(prisma.locker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: LOCKER_ID,
          memberId: MEMBER_ID,
          facilityId: FACILITY_ID,
        }),
      }),
    );
  });
});

// ── GET /api/sensors/history ───────────────────────────────────────────

describe("GET /api/sensors/history", () => {
  it("verifies the requested locker belongs to the member's active facility", async () => {
    withMember();
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: LOCKER_ID,
    });
    (prisma.sensorReading.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/sensors/history/route");
    await GET(
      new NextRequest(
        `http://localhost/api/sensors/history?lockerId=${LOCKER_ID}&range=24h`,
      ),
    );
    expect(prisma.locker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: LOCKER_ID,
          memberId: MEMBER_ID,
          facilityId: FACILITY_ID,
        }),
      }),
    );
  });

  it("returns 404 (and never reads sensor data) when the locker isn't owned", async () => {
    withMember();
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/sensors/history/route");
    const res = await GET(
      new NextRequest(
        `http://localhost/api/sensors/history?lockerId=${LOCKER_ID}&range=24h`,
      ),
    );
    expect(res.status).toBe(404);
    expect(prisma.sensorReading.findMany).not.toHaveBeenCalled();
  });
});

// ── GET /api/alerts ────────────────────────────────────────────────────

describe("GET /api/alerts", () => {
  it("scopes alerts through locker.memberId AND locker.facilityId", async () => {
    withMember();
    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { GET } = await import("@/app/api/alerts/route");
    await GET(new NextRequest("http://localhost/api/alerts"));
    const args = (prisma.alert.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(args.where.locker).toEqual(
      expect.objectContaining({
        memberId: MEMBER_ID,
        facilityId: FACILITY_ID,
      }),
    );
  });
});

// ── GET /api/certificates/[id] ─────────────────────────────────────────

describe("GET /api/certificates/[id]", () => {
  it("enforces ownership through the wine relation in a single query", async () => {
    withMember();
    (prisma.provenanceCertificate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/certificates/[id]/route");
    await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CERT_ID }),
    });
    const args = (prisma.provenanceCertificate.findFirst as ReturnType<typeof vi.fn>)
      .mock.calls[0]![0];
    expect(args.where.id).toBe(CERT_ID);
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.wine).toEqual(
      expect.objectContaining({ memberId: MEMBER_ID }),
    );
  });

  it("returns 404 (not 403) to avoid leaking which cert IDs exist", async () => {
    withMember();
    (prisma.provenanceCertificate.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { GET } = await import("@/app/api/certificates/[id]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: CERT_ID }),
    });
    expect(res.status).toBe(404);
  });
});
