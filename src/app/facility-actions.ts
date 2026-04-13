"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { FACILITY_COOKIE } from "@/lib/current-facility";

/**
 * Switch the active facility for the current member. Verifies the
 * member actually belongs to the target facility before writing the
 * cookie — otherwise a tampered request could read another facility's
 * lockers via the page-level filters.
 */
export async function setCurrentFacility(
  facilityId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const membership = await prisma.facilityMember.findUnique({
    where: {
      memberId_facilityId: { memberId: session.user.id, facilityId },
    },
    select: { facilityId: true },
  });
  if (!membership) return { ok: false, error: "Not a member of that facility" };

  // Scope the cookie to the current NextAuth session (4h). A year-long
  // cookie outlives the session and leaves a stale facility preference
  // active after logout — we'd rather the nav default to the first
  // membership than a cookie the user can't see.
  cookies().set(FACILITY_COOKIE, facilityId, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
