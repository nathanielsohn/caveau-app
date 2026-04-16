"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

/**
 * Reassign a locker to a different member (or unassign entirely).
 * Admin-only — caller role is re-checked here in addition to the
 * middleware + layout gates.
 */
export async function reassignLockerAction(
  lockerId: string,
  memberId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") {
    return { ok: false, error: "Forbidden" };
  }

  if (!lockerId) return { ok: false, error: "Missing locker ID" };

  // If assigning, confirm the member exists and is a member of the
  // locker's facility so we don't cross-assign across locations.
  if (memberId) {
    const locker = await prisma.locker.findUnique({
      where: { id: lockerId },
      select: { facilityId: true },
    });
    if (!locker) return { ok: false, error: "Locker not found" };

    const membership = await prisma.facilityMember.findUnique({
      where: {
        memberId_facilityId: { memberId, facilityId: locker.facilityId },
      },
    });
    if (!membership) {
      return {
        ok: false,
        error: "Member is not enrolled at this locker's facility",
      };
    }
  }

  await prisma.locker.update({
    where: { id: lockerId },
    data: { memberId: memberId },
  });

  revalidatePath("/admin/lockers");
  revalidatePath("/admin");
  return { ok: true };
}
