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

// ── Driver token ──────────────────────────────────────────────────────────

/** base64url-encoded 32-byte random = 43 chars. Be generous (32-128) so
 *  future key-length tweaks don't break the route-param validator. */
export const DRIVER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

/** 256-bit random token, base64url encoded. Populated on the final
 *  member-side transition (see address/otp routes) to key the public
 *  `/handoff-driver/[token]` driver URL. */
export function generateDriverToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface DriverBundle {
  delivery: {
    id: string;
    memberId: string;
    status: DeliveryStatus;
    otpRequired: boolean;
    expiresAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
    deliveryAddressLine1: string;
    deliveryAddressLine2: string | null;
    deliveryCity: string;
    deliveryState: string;
    deliveryPostalCode: string;
  };
  member: { name: string };
  items: Array<{
    id: string;
    name: string;
    vintage: number;
    producer: string;
  }>;
  recipients: Array<{
    id: string;
    name: string;
    relationship: string | null;
  }>;
}

/** Loads a delivery by its driverToken. Returns null on miss. The bundle
 *  carries only fields the public driver page renders — never PIN, OTP,
 *  salts/hashes, or wine currentValue. */
export async function loadDeliveryByDriverToken(
  token: string,
): Promise<DriverBundle | null> {
  if (!DRIVER_TOKEN_PATTERN.test(token)) return null;

  const row = await prisma.deliveryRequest.findUnique({
    where: { driverToken: token },
    select: {
      id: true,
      memberId: true,
      status: true,
      otpRequired: true,
      expiresAt: true,
      completedAt: true,
      cancelledAt: true,
      deliveryAddressLine1: true,
      deliveryAddressLine2: true,
      deliveryCity: true,
      deliveryState: true,
      deliveryPostalCode: true,
      member: { select: { name: true } },
      items: {
        select: {
          id: true,
          wine: {
            select: { id: true, name: true, vintage: true, producer: true },
          },
        },
      },
    },
  });
  if (!row) return null;

  const recipients = await prisma.authorizedRecipient.findMany({
    where: { memberId: row.memberId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, relationship: true },
  });

  return {
    delivery: {
      id: row.id,
      memberId: row.memberId,
      status: row.status,
      otpRequired: row.otpRequired,
      expiresAt: row.expiresAt,
      completedAt: row.completedAt,
      cancelledAt: row.cancelledAt,
      deliveryAddressLine1: row.deliveryAddressLine1,
      deliveryAddressLine2: row.deliveryAddressLine2,
      deliveryCity: row.deliveryCity,
      deliveryState: row.deliveryState,
      deliveryPostalCode: row.deliveryPostalCode,
    },
    member: { name: row.member.name },
    items: row.items.map((it) => ({
      id: it.id,
      name: it.wine.name,
      vintage: it.wine.vintage,
      producer: it.wine.producer,
    })),
    recipients,
  };
}

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
