/**
 * Route tests for the member-side Deliver Now API (feature #51).
 *
 * Each test mocks prisma + auth + rate-limit + the delivery helper lib, then
 * invokes the route handler directly. We stub the helper lib rather than the
 * raw hash primitives so the tests assert route behavior (status transitions,
 * rate-limit trips, cross-member scoping) without re-testing crypto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wine: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    deliveryRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    deliveryRequestItem: {
      createMany: vi.fn(),
    },
    deliveryEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  getServerAuth: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendDeliveryOtpEmail: vi.fn().mockResolvedValue(true),
}));

// Stub the delivery helpers so we control PIN/OTP verification + OTP-required
// math without needing a real DB aggregate. The state machine + TTL helpers
// use the real implementation via importActual — their logic IS what we want
// to test.
vi.mock("@/lib/delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/delivery")>(
    "@/lib/delivery",
  );
  return {
    ...actual,
    generatePin: vi.fn(() => "1234"),
    generateOtp: vi.fn(() => "567890"),
    hashPin: vi.fn(() => ({ salt: "pin-salt", hash: "pin-hash" })),
    hashOtp: vi.fn(() => ({ salt: "otp-salt", hash: "otp-hash" })),
    verifyPin: vi.fn(),
    verifyOtp: vi.fn(),
    isOtpRequired: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  isOtpRequired,
  verifyPin,
  verifyOtp,
} from "@/lib/delivery";

type Mock = ReturnType<typeof vi.fn>;

const MEMBER_ID = "00000000-0000-4000-8000-00000000aaaa";
const DELIVERY_ID = "00000000-0000-4000-8000-000000000001";
const WINE_ID_1 = "00000000-0000-4000-8000-000000000011";
const WINE_ID_2 = "00000000-0000-4000-8000-000000000012";

function withSession(userId: string = MEMBER_ID) {
  (getServerAuth as unknown as Mock).mockResolvedValue({
    user: { id: userId, name: "Test", email: "test@caveau.com" },
  });
}

function allowRateLimit() {
  (checkRateLimit as unknown as Mock).mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  });
}

/**
 * `prisma.$transaction` accepts either an array of promises or an async
 * callback. The routes use both shapes, so the default mock handles both.
 */
function stubTransaction() {
  (prisma.$transaction as unknown as Mock).mockImplementation(
    async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
});

// ── POST /api/deliveries (create) ────────────────────────────────────────

describe("POST /api/deliveries", () => {
  const validBody = {
    wineIds: [WINE_ID_1, WINE_ID_2],
    address: {
      line1: "1245 Galleon Dr",
      city: "Naples",
      state: "FL",
      postalCode: "34102",
    },
  };

  it("returns 401 without a session and never touches the DB", async () => {
    (getServerAuth as unknown as Mock).mockResolvedValue(null);
    const { POST } = await import("@/app/api/deliveries/route");
    const res = await POST(
      new NextRequest("http://localhost/api/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(401);
    expect(prisma.deliveryRequest.create).not.toHaveBeenCalled();
  });

  it("creates a delivery with otpRequired=true when total crosses $2K and returns the PIN once", async () => {
    withSession();
    allowRateLimit();
    (prisma.wine.findMany as Mock).mockResolvedValue([
      { id: WINE_ID_1 },
      { id: WINE_ID_2 },
    ]);
    (isOtpRequired as unknown as Mock).mockResolvedValue(true);
    (prisma.deliveryRequest.create as Mock).mockResolvedValue({
      id: DELIVERY_ID,
      status: "requested",
      otpRequired: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const { POST } = await import("@/app/api/deliveries/route");
    const res = await POST(
      new NextRequest("http://localhost/api/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBe(DELIVERY_ID);
    expect(body.otpRequired).toBe(true);
    expect(body.pin).toBe("1234");

    // Created with memberId from session, not the body.
    const createArgs = (prisma.deliveryRequest.create as Mock).mock.calls[0][0];
    expect(createArgs.data.memberId).toBe(MEMBER_ID);
    expect(createArgs.data.otpRequired).toBe(true);
    expect(createArgs.data.otpSalt).toBe("otp-salt");

    // Initial event is appended.
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryRequestId: DELIVERY_ID,
          actor: "member",
          type: "requested",
        }),
      }),
    );
  });

  it("rejects with 400 when any wineId belongs to another member", async () => {
    withSession();
    allowRateLimit();
    // Only one of the two ids is owned by the session's member.
    (prisma.wine.findMany as Mock).mockResolvedValue([{ id: WINE_ID_1 }]);

    const { POST } = await import("@/app/api/deliveries/route");
    const res = await POST(
      new NextRequest("http://localhost/api/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(400);
    expect(prisma.deliveryRequest.create).not.toHaveBeenCalled();
  });

  it("trips at 429 when the rate limiter refuses", async () => {
    withSession();
    (checkRateLimit as unknown as Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    const { POST } = await import("@/app/api/deliveries/route");
    const res = await POST(
      new NextRequest("http://localhost/api/deliveries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(429);
    expect(prisma.wine.findMany).not.toHaveBeenCalled();
  });
});

// ── POST /api/deliveries/[id]/biometric ──────────────────────────────────

describe("POST /api/deliveries/[id]/biometric", () => {
  it("returns 404 when the delivery belongs to another member (cross-member scoping)", async () => {
    withSession(MEMBER_ID);
    // findFirst with { id, memberId } yields null — the row exists but under
    // a different memberId, so the caller can't see it.
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/deliveries/[id]/biometric/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: DELIVERY_ID }),
    });
    expect(res.status).toBe(404);
    // The where-clause must include both id AND memberId — otherwise a
    // cross-member scan could leak existence.
    const args = (prisma.deliveryRequest.findFirst as Mock).mock.calls[0][0];
    expect(args.where.id).toBe(DELIVERY_ID);
    expect(args.where.memberId).toBe(MEMBER_ID);
  });

  it("is idempotent — re-posting when already true is a 200 without a duplicate event", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue({
      id: DELIVERY_ID,
      status: "requested",
      isBiometricVerified: true,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { POST } = await import(
      "@/app/api/deliveries/[id]/biometric/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: DELIVERY_ID }),
    });
    expect(res.status).toBe(200);
    expect(prisma.deliveryEvent.create).not.toHaveBeenCalled();
    expect(prisma.deliveryRequest.update).not.toHaveBeenCalled();
  });

  it("flips the flag and appends an event on the first verification", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue({
      id: DELIVERY_ID,
      status: "requested",
      isBiometricVerified: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const { POST } = await import(
      "@/app/api/deliveries/[id]/biometric/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: DELIVERY_ID }),
    });
    expect(res.status).toBe(200);
    expect(prisma.deliveryRequest.update).toHaveBeenCalledWith({
      where: { id: DELIVERY_ID },
      data: { isBiometricVerified: true },
    });
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryRequestId: DELIVERY_ID,
          actor: "member",
          type: "biometric_verified",
        }),
      }),
    );
  });
});

// ── POST /api/deliveries/[id]/pin ────────────────────────────────────────

describe("POST /api/deliveries/[id]/pin", () => {
  function deliveryAt(
    overrides: Partial<{
      status: string;
      isBiometricVerified: boolean;
      otpRequired: boolean;
      expiresAt: Date;
      pinAttempts: number;
    }> = {},
  ) {
    return {
      id: DELIVERY_ID,
      status: "requested",
      isBiometricVerified: true,
      otpRequired: true,
      pinSalt: "pin-salt",
      pinHash: "pin-hash",
      pinAttempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
      ...overrides,
    };
  }

  async function callPin(body: unknown = { deliveryRequestId: DELIVERY_ID, pin: "1234" }) {
    const { POST } = await import("@/app/api/deliveries/[id]/pin/route");
    return POST(
      new NextRequest("http://localhost/api/deliveries/x/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: DELIVERY_ID }) },
    );
  }

  it("returns 401 with remainingAttempts on a wrong PIN and records a pin_failed event", async () => {
    withSession();
    (checkRateLimit as unknown as Mock).mockResolvedValue({
      allowed: true,
      remaining: 3,
      resetAt: Date.now() + 15 * 60_000,
    });
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(deliveryAt());
    (verifyPin as unknown as Mock).mockReturnValue(false);

    const res = await callPin();
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe("invalid_pin");
    expect(body.remainingAttempts).toBe(3);
    // pinAttempts incremented, pin_failed event logged.
    expect(prisma.deliveryRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { pinAttempts: { increment: 1 } },
      }),
    );
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pin_failed" }),
      }),
    );
  });

  it("returns 429 once the rate limiter refuses (6th attempt after 5 misses)", async () => {
    withSession();
    (checkRateLimit as unknown as Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 15 * 60_000,
    });
    const res = await callPin();
    expect(res.status).toBe(429);
    // Never touched the row — rate limit short-circuits.
    expect(prisma.deliveryRequest.findFirst).not.toHaveBeenCalled();
  });

  it("returns 412 when biometric has not been verified", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAt({ isBiometricVerified: false }),
    );
    const res = await callPin();
    expect(res.status).toBe(412);
    expect(verifyPin).not.toHaveBeenCalled();
  });

  it("returns 410 when the delivery has expired", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAt({ expiresAt: new Date(Date.now() - 60_000) }),
    );
    const res = await callPin();
    expect(res.status).toBe(410);
  });

  it("returns 409 after cancel — post-cancellation /pin must fail", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAt({ status: "cancelled" }),
    );
    const res = await callPin();
    expect(res.status).toBe(409);
  });

  it("advances status to pin_entered and stamps pinVerifiedAt on hit", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(deliveryAt());
    (verifyPin as unknown as Mock).mockReturnValue(true);

    const res = await callPin();
    expect(res.status).toBe(200);
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe("pin_entered");
    expect(updateArgs.data.pinVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pin_entered" }),
      }),
    );
  });
});

// ── POST /api/deliveries/[id]/otp/send ───────────────────────────────────

describe("POST /api/deliveries/[id]/otp/send", () => {
  function deliveryAtConfirmed(
    overrides: Partial<{ otpRequired: boolean; status: string; expiresAt: Date }> = {},
  ) {
    return {
      id: DELIVERY_ID,
      status: "address_confirmed",
      otpRequired: true,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      member: { name: "Test", email: "test@caveau.com" },
      items: [
        { wine: { currentValue: 1500 } },
        { wine: { currentValue: 800 } },
      ],
      ...overrides,
    };
  }

  async function callSend() {
    const { POST } = await import(
      "@/app/api/deliveries/[id]/otp/send/route"
    );
    return POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: DELIVERY_ID }),
    });
  }

  it("returns 400 when otpRequired is false (total < $2K)", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAtConfirmed({ otpRequired: false }),
    );
    const res = await callSend();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("otp_not_required");
  });

  it("returns 429 when a recent otp_sent event is inside the 60s cooldown", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAtConfirmed(),
    );
    (prisma.deliveryEvent.findFirst as Mock).mockResolvedValue({
      createdAt: new Date(Date.now() - 10_000),
    });
    const res = await callSend();
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe("otp_cooldown");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("rotates the OTP and appends an otp_sent event on success", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAtConfirmed(),
    );
    (prisma.deliveryEvent.findFirst as Mock).mockResolvedValue(null);

    const res = await callSend();
    expect(res.status).toBe(200);

    // OTP hash + salt were written onto the row.
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.data.otpSalt).toBe("otp-salt");
    expect(updateArgs.data.otpHash).toBe("otp-hash");
    expect(updateArgs.data.otpAttempts).toBe(0);

    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actor: "system",
          type: "otp_sent",
        }),
      }),
    );
  });
});

// ── POST /api/deliveries/[id]/otp ────────────────────────────────────────

describe("POST /api/deliveries/[id]/otp", () => {
  function deliveryAtAddressConfirmed(
    overrides: Partial<{ otpRequired: boolean; status: string; otpSalt: string | null }> = {},
  ) {
    return {
      id: DELIVERY_ID,
      status: "address_confirmed",
      otpRequired: true,
      otpSalt: "otp-salt",
      otpHash: "otp-hash",
      otpAttempts: 0,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      ...overrides,
    };
  }

  async function callOtp(body: unknown = { deliveryRequestId: DELIVERY_ID, otp: "567890" }) {
    const { POST } = await import("@/app/api/deliveries/[id]/otp/route");
    return POST(
      new NextRequest("http://localhost/api/deliveries/x/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: DELIVERY_ID }) },
    );
  }

  it("advances to otp_verified on a hit and stamps otpVerifiedAt", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAtAddressConfirmed(),
    );
    (verifyOtp as unknown as Mock).mockReturnValue(true);

    const res = await callOtp();
    expect(res.status).toBe(200);
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe("otp_verified");
    expect(updateArgs.data.otpVerifiedAt).toBeInstanceOf(Date);
  });

  it("refuses the canTransition shortcut when otpRequired=false", async () => {
    withSession();
    allowRateLimit();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue(
      deliveryAtAddressConfirmed({ otpRequired: false }),
    );
    const res = await callOtp();
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe("otp_not_required");
  });
});

// ── POST /api/deliveries/[id]/cancel ─────────────────────────────────────

describe("POST /api/deliveries/[id]/cancel", () => {
  async function callCancel() {
    const { POST } = await import("@/app/api/deliveries/[id]/cancel/route");
    return POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: DELIVERY_ID }),
    });
  }

  it("cancels a non-terminal delivery and appends a cancelled event", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue({
      id: DELIVERY_ID,
      status: "pin_entered",
    });
    const res = await callCancel();
    expect(res.status).toBe(200);
    expect(prisma.deliveryRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "cancelled",
          cancelledAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "cancelled" }),
      }),
    );
  });

  it("refuses to cancel a terminal delivery", async () => {
    withSession();
    (prisma.deliveryRequest.findFirst as Mock).mockResolvedValue({
      id: DELIVERY_ID,
      status: "completed",
    });
    const res = await callCancel();
    expect(res.status).toBe(409);
    expect(prisma.deliveryRequest.update).not.toHaveBeenCalled();
  });
});
