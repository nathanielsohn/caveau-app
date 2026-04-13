import { cookies } from "next/headers";
import { prisma } from "./prisma";

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
