import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getServerAuth } from "./auth";
import { env } from "./env";

const FACILITY_COOKIE = "caveau_facility";

/**
 * Sign a cookie value with HMAC-SHA256 keyed on FACILITY_COOKIE_SECRET
 * (which falls back to NEXTAUTH_SECRET in dev, see src/lib/env.ts). The
 * returned string is `${value}.${sig}` — compact, URL-safe, and small
 * enough to fit comfortably alongside other cookies.
 *
 * Even though `getCurrentFacility` below still validates that the
 * facility id maps to a real membership, signing the cookie prevents
 * an attacker with cookie-write (e.g. via a subdomain XSS) from pinning
 * a victim to a different facility within their own set of memberships.
 * It also means any hand-crafted cookie is rejected outright instead of
 * silently passing the membership check on one of the victim's rows.
 */
export function signValue(value: string): string {
  const sig = createHmac("sha256", env.FACILITY_COOKIE_SECRET)
    .update(value)
    .digest("base64url");
  return `${value}.${sig}`;
}

/**
 * Verify a signed cookie. Returns the original value on success or null
 * on any failure (missing signature, wrong length, tampered payload,
 * different signing key). Uses `timingSafeEqual` to avoid leaking byte
 * positions via comparison time.
 */
export function verifySigned(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0 || dot === signed.length - 1) return null;

  const value = signed.slice(0, dot);
  const provided = signed.slice(dot + 1);
  const expected = createHmac("sha256", env.FACILITY_COOKIE_SECRET)
    .update(value)
    .digest("base64url");

  if (provided.length !== expected.length) return null;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? value : null;
}

export interface FacilityOption {
  id: string;
  name: string;
  location: string;
  type: "vault" | "private_location";
  privateLocationKind: string | null;
}

/**
 * List the facilities the member belongs to, ordered by name.
 * Used by the nav switcher and the current-facility resolver.
 */
export async function getMemberFacilities(
  memberId: string,
): Promise<FacilityOption[]> {
  const rows = await prisma.facilityMember.findMany({
    where: {
      memberId,
      OR: [
        { facility: { type: "vault" } },
        { facility: { type: "private_location", ownerMemberId: memberId } },
      ],
    },
    include: {
      facility: {
        select: {
          id: true,
          name: true,
          location: true,
          type: true,
          privateLocationKind: true,
        },
      },
    },
    orderBy: { facility: { name: "asc" } },
  });
  return rows.map((r) => r.facility);
}

/**
 * Resolve the active facility for this request. Reads the
 * `caveau_facility` cookie and validates that the member still belongs
 * to it; if the cookie is missing or stale, falls back to the first
 * facility the member belongs to. Returns null only when the member
 * has zero memberships (which only happens for partially-seeded data).
 */
export async function getCurrentFacility(
  memberId: string,
): Promise<FacilityOption | null> {
  const facilities = await getMemberFacilities(memberId);
  if (facilities.length === 0) return null;

  const raw = (await cookies()).get(FACILITY_COOKIE)?.value;
  const cookieId = raw ? verifySigned(raw) : null;
  if (cookieId) {
    const match = facilities.find((f) => f.id === cookieId);
    if (match) return match;
  }
  return facilities[0] ?? null;
}

export { FACILITY_COOKIE };

/**
 * Resolve the authenticated member + their active facility in one round trip.
 * Returns null when there's no session or the member has zero memberships.
 *
 * Every endpoint that touches locker-scoped data (lockers, slots, sensors,
 * alerts) should call this helper instead of `getServerAuth` + a raw query —
 * it's the single point where we enforce that the cookie's facilityId
 * actually matches a real membership of this member.
 */
export async function requireMemberFacility(): Promise<
  { memberId: string; facilityId: string } | null
> {
  const session = await getServerAuth();
  const memberId = session?.user?.id;
  if (!memberId) return null;
  const facility = await getCurrentFacility(memberId);
  if (!facility) return null;
  return { memberId, facilityId: facility.id };
}
