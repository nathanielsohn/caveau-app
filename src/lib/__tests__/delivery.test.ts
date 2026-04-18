/**
 * Unit tests for the delivery scaffolding (feature #51).
 *
 * Covers PIN/OTP hash round-trip, state-machine guards, TTL, OTP-threshold
 * math (prisma.wine.aggregate mocked), and PIN/OTP format invariants.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    wine: {
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  generatePin,
  generateOtp,
  hashPin,
  hashOtp,
  verifyPin,
  verifyOtp,
  isOtpRequired,
  OTP_THRESHOLD_USD,
  canTransition,
  ALLOWED_TRANSITIONS,
  defaultExpiresAt,
} from "../delivery";

type Mock = ReturnType<typeof vi.fn>;
const aggregateMock = prisma.wine.aggregate as unknown as Mock;

beforeEach(() => {
  aggregateMock.mockReset();
});

describe("generatePin", () => {
  it("always returns a 4-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePin()).toMatch(/^\d{4}$/);
    }
  });
});

describe("generateOtp", () => {
  it("always returns a 6-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe("hashPin / verifyPin round-trip", () => {
  it("verifies the correct PIN", () => {
    const { salt, hash } = hashPin("2847");
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPin("2847", salt, hash)).toBe(true);
  });

  it("rejects the wrong PIN", () => {
    const { salt, hash } = hashPin("2847");
    expect(verifyPin("2846", salt, hash)).toBe(false);
  });

  it("produces a different salt on each call (randomness check)", () => {
    const a = hashPin("0000");
    const b = hashPin("0000");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("preserves leading zeros — 0001 verifies as 0001 not 1", () => {
    const { salt, hash } = hashPin("0001");
    expect(verifyPin("0001", salt, hash)).toBe(true);
    expect(verifyPin("1", salt, hash)).toBe(false);
  });
});

describe("hashOtp / verifyOtp round-trip", () => {
  it("verifies the correct OTP", () => {
    const { salt, hash } = hashOtp("518204");
    expect(verifyOtp("518204", salt, hash)).toBe(true);
    expect(verifyOtp("518205", salt, hash)).toBe(false);
  });
});

describe("verify — defensive", () => {
  it("returns false on length-mismatched hex without throwing", () => {
    const { salt } = hashPin("2847");
    expect(verifyPin("2847", salt, "tooshort")).toBe(false);
    expect(verifyPin("2847", salt, "")).toBe(false);
  });

  it("returns false on malformed hex without throwing", () => {
    const { salt } = hashPin("2847");
    expect(verifyPin("2847", salt, "z".repeat(64))).toBe(false);
  });

  it("returns false when salt is wrong even if hash looks valid", () => {
    const { hash } = hashPin("2847");
    const { salt: otherSalt } = hashPin("2847");
    expect(verifyPin("2847", otherSalt, hash)).toBe(false);
  });
});

describe("isOtpRequired", () => {
  it("returns false for an empty wineIds list without querying the DB", async () => {
    expect(await isOtpRequired([], "member-1")).toBe(false);
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("returns true when the sum meets the threshold", async () => {
    aggregateMock.mockResolvedValue({ _sum: { currentValue: OTP_THRESHOLD_USD } });
    expect(await isOtpRequired(["w1"], "m1")).toBe(true);
  });

  it("returns true when the sum exceeds the threshold", async () => {
    aggregateMock.mockResolvedValue({ _sum: { currentValue: 5000 } });
    expect(await isOtpRequired(["w1", "w2"], "m1")).toBe(true);
  });

  it("returns false when the sum is under the threshold", async () => {
    aggregateMock.mockResolvedValue({ _sum: { currentValue: 1500 } });
    expect(await isOtpRequired(["w1"], "m1")).toBe(false);
  });

  it("scopes the aggregate by memberId (defense in depth)", async () => {
    aggregateMock.mockResolvedValue({ _sum: { currentValue: 0 } });
    await isOtpRequired(["w1"], "member-under-test");
    const call = aggregateMock.mock.calls[0][0];
    expect(call.where).toMatchObject({ memberId: "member-under-test" });
    expect(call.where.id).toEqual({ in: ["w1"] });
  });

  it("treats a null _sum.currentValue as 0", async () => {
    aggregateMock.mockResolvedValue({ _sum: { currentValue: null } });
    expect(await isOtpRequired(["w1"], "m1")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows the happy path with OTP required", () => {
    expect(canTransition("requested", "pin_entered", { otpRequired: true })).toBe(true);
    expect(canTransition("pin_entered", "address_confirmed", { otpRequired: true })).toBe(true);
    expect(canTransition("address_confirmed", "otp_verified", { otpRequired: true })).toBe(true);
    expect(canTransition("otp_verified", "handoff_started", { otpRequired: true })).toBe(true);
    expect(canTransition("handoff_started", "id_scanned", { otpRequired: true })).toBe(true);
    expect(canTransition("id_scanned", "completed", { otpRequired: true })).toBe(true);
  });

  it("allows skipping OTP when not required", () => {
    expect(
      canTransition("address_confirmed", "handoff_started", { otpRequired: false }),
    ).toBe(true);
  });

  it("blocks skipping OTP when required", () => {
    expect(
      canTransition("address_confirmed", "handoff_started", { otpRequired: true }),
    ).toBe(false);
  });

  it("blocks going through OTP when not required", () => {
    expect(
      canTransition("address_confirmed", "otp_verified", { otpRequired: false }),
    ).toBe(false);
  });

  it("rejects non-adjacent jumps", () => {
    expect(canTransition("requested", "completed", { otpRequired: true })).toBe(false);
    expect(canTransition("requested", "handoff_started", { otpRequired: false })).toBe(false);
    expect(canTransition("pin_entered", "id_scanned", { otpRequired: true })).toBe(false);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("completed", "cancelled", { otpRequired: false })).toBe(false);
    expect(canTransition("cancelled", "requested", { otpRequired: false })).toBe(false);
    expect(canTransition("expired", "cancelled", { otpRequired: false })).toBe(false);
  });

  it("allows cancellation from any non-terminal state", () => {
    const nonTerminal = [
      "requested",
      "pin_entered",
      "address_confirmed",
      "otp_verified",
      "handoff_started",
      "id_scanned",
    ] as const;
    for (const s of nonTerminal) {
      expect(canTransition(s, "cancelled", { otpRequired: true })).toBe(true);
    }
  });

  it("allows expiry only from pre-handoff states", () => {
    expect(canTransition("requested", "expired", { otpRequired: true })).toBe(true);
    expect(canTransition("otp_verified", "expired", { otpRequired: true })).toBe(true);
    // Once handoff has started, a separate short window governs timeouts;
    // the coarse `expires_at` no longer applies.
    expect(canTransition("handoff_started", "expired", { otpRequired: true })).toBe(false);
    expect(canTransition("id_scanned", "expired", { otpRequired: true })).toBe(false);
  });
});

describe("ALLOWED_TRANSITIONS", () => {
  it("covers every DeliveryStatus key (no missing state)", () => {
    const keys = Object.keys(ALLOWED_TRANSITIONS).sort();
    expect(keys).toEqual(
      [
        "address_confirmed",
        "cancelled",
        "completed",
        "expired",
        "handoff_started",
        "id_scanned",
        "otp_verified",
        "pin_entered",
        "requested",
      ].sort(),
    );
  });

  it("has no self-loops", () => {
    for (const [from, tos] of Object.entries(ALLOWED_TRANSITIONS)) {
      expect(tos).not.toContain(from);
    }
  });
});

describe("defaultExpiresAt", () => {
  it("returns a Date 24h after the given now", () => {
    const now = new Date("2026-04-17T12:00:00Z");
    const exp = defaultExpiresAt(now);
    expect(exp.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("defaults to now when called with no argument", () => {
    const before = Date.now();
    const exp = defaultExpiresAt();
    const after = Date.now();
    const delta = exp.getTime() - before;
    expect(delta).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
    expect(delta).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + (after - before));
  });
});
