import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getServerAuth } from "./auth";

const FACILITY_COOKIE = "caveau_facility";

export interface FacilityOption {
  id: string;
  name: string;
  location: string;
}

/**
 * List the facilities the member belongs to, ordered by name.
 * Used by the nav switcher and the current-facility resolver.
 */
export async function getMemberFacilities(
  memberId: string,
): Promise<FacilityOption[]> {
  const rows = await prisma.facilityMember.findMany({
    where: { memberId },
    include: {
      facility: { select: { id: true, name: true, location: true } },
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

  const cookieId = cookies().get(FACILITY_COOKIE)?.value;
  if (cookieId) {
    const match = facilities.find((f) => f.id === cookieId);
    if (match) return match;
  }
  return facilities[0];
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
