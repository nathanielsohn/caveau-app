/**
 * Delivery request state machine + PIN/OTP crypto for feature #51
 * (biometric-verified Deliver Now).
 *
 * Short-lived 4-digit PINs and 6-digit OTPs are hashed with SHA-256 + a
 * per-request 16-byte random salt. Justified over bcrypt because:
 *   - Request TTL is 24h and attempt count is capped at 5/15min via
 *     checkRateLimit (src/lib/rate-limit.ts), so brute-force is bounded
 *     well below what bcrypt's cost would matter for.
 *   - Staff door-side workflows want fast verification, not ~100ms/attempt.
 *   - Matches the hashIp() primitive in src/lib/handoff.ts so future
 *     reviewers find one hashing pattern in this codebase, not two.
 */

import { randomBytes, createHash, timingSafeEqual } from "crypto";
import type { DeliveryStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber } from "./utils";

// ── PIN / OTP generation ──────────────────────────────────────────────────

/** 4-digit numeric PIN, leading zeros preserved. Mod-bias is ~0.08% over
 *  a uniform 16-bit random (negligible for a rate-limited 5-attempt window). */
export function generatePin(): string {
  const n = randomBytes(2).readUInt16BE(0) % 10000;
  return n.toString().padStart(4, "0");
}

/** 6-digit numeric OTP, leading zeros preserved. */
export function generateOtp(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

// ── Hashing ───────────────────────────────────────────────────────────────

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function hashWithSalt(value: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = sha256Hex(`${salt}:${value}`);
  return { salt, hash };
}

function verifyWithSalt(
  input: string,
  salt: string,
  expectedHash: string,
): boolean {
  try {
    const candidate = sha256Hex(`${salt}:${input}`);
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(expectedHash, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Returns { salt, hash } — salt is 32-char hex, hash is 64-char hex.
 *  Both strings are stored atomically on the DeliveryRequest row. */
export function hashPin(pin: string): { salt: string; hash: string } {
  return hashWithSalt(pin);
}

/** Same shape as hashPin — separate name keeps call-sites self-documenting. */
export function hashOtp(otp: string): { salt: string; hash: string } {
  return hashWithSalt(otp);
}

/** Constant-time PIN comparison. Returns false on any error
 *  (including length mismatch or malformed hex). */
export function verifyPin(
  input: string,
  salt: string,
  expectedHash: string,
): boolean {
  return verifyWithSalt(input, salt, expectedHash);
}

/** Constant-time OTP comparison. */
export function verifyOtp(
  input: string,
  salt: string,
  expectedHash: string,
): boolean {
  return verifyWithSalt(input, salt, expectedHash);
}

// ── OTP threshold ─────────────────────────────────────────────────────────

export const OTP_THRESHOLD_USD = 2000;

/**
 * Sums currentValue across the given wineIds, scoped to memberId as defense
 * in depth. Returns true when total >= OTP_THRESHOLD_USD. Missing or
 * out-of-scope wines contribute 0.
 */
export async function isOtpRequired(
  wineIds: string[],
  memberId: string,
): Promise<boolean> {
  if (wineIds.length === 0) return false;
  const aggregate = await prisma.wine.aggregate({
    where: { id: { in: wineIds }, memberId },
    _sum: { currentValue: true },
  });
  return toNumber(aggregate._sum.currentValue) >= OTP_THRESHOLD_USD;
}

// ── State machine ─────────────────────────────────────────────────────────

/** Map of status → allowed next statuses. The address_confirmed branch is
 *  resolved at transition time by canTransition() based on otpRequired. */
export const ALLOWED_TRANSITIONS: Readonly<
  Record<DeliveryStatus, readonly DeliveryStatus[]>
> = {
  requested: ["pin_entered", "cancelled", "expired"],
  pin_entered: ["address_confirmed", "cancelled", "expired"],
  address_confirmed: ["otp_verified", "handoff_started", "cancelled", "expired"],
  otp_verified: ["handoff_started", "cancelled", "expired"],
  handoff_started: ["id_scanned", "cancelled"],
  id_scanned: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  expired: [],
};

/**
 * Guards a status transition. Pass otpRequired so the branch from
 * address_confirmed is unambiguous: without OTP, skips straight to
 * handoff_started; with OTP, must go through otp_verified first.
 */
export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  opts: { otpRequired: boolean },
): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) return false;
  if (from === "address_confirmed") {
    if (to === "otp_verified" && !opts.otpRequired) return false;
    if (to === "handoff_started" && opts.otpRequired) return false;
  }
  return true;
}

// ── TTL ───────────────────────────────────────────────────────────────────

const DEFAULT_TTL_HOURS = 24;

/** +24h from now. Centralized so seed.ts, tests, and the create route all
 *  agree on the TTL without a magic number drifting. */
export function defaultExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + DEFAULT_TTL_HOURS * 60 * 60 * 1000);
}
