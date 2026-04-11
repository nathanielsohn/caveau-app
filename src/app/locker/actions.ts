"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

/**
 * Assign a wine to an empty locker slot.
 * Validates that the authenticated member owns both the wine and the locker.
 */
export async function assignWineToSlot(
  slotId: string,
  wineId: string
): Promise<{ error?: string }> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const memberId = session.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      // Verify the slot exists, belongs to the member's locker, and is empty
      const slot = await tx.lockerSlot.findUnique({
        where: { id: slotId },
        include: { locker: { select: { memberId: true } } },
      });

      if (!slot) throw new Error("Slot not found");
      if (slot.locker.memberId !== memberId) throw new Error("Not your locker");
      if (slot.wineId) throw new Error("Slot is already occupied");

      // Verify the wine belongs to the member and is not already in a slot
      const wine = await tx.wine.findUnique({
        where: { id: wineId },
        select: { memberId: true },
      });

      if (!wine) throw new Error("Wine not found");
      if (wine.memberId !== memberId) throw new Error("Not your wine");

      const existingSlot = await tx.lockerSlot.findFirst({
        where: { wineId },
      });
      if (existingSlot) throw new Error("Wine is already assigned to a slot");

      // Assign the wine to the slot
      await tx.lockerSlot.update({
        where: { id: slotId },
        data: { wineId, dateStored: new Date() },
      });
    });

    revalidatePath("/locker");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to assign wine" };
  }
}

/**
 * Remove a wine from a locker slot.
 * Validates that the authenticated member owns the locker.
 */
export async function removeWineFromSlot(
  slotId: string
): Promise<{ error?: string }> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const memberId = session.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      // Verify the slot exists and belongs to the member's locker
      const slot = await tx.lockerSlot.findUnique({
        where: { id: slotId },
        include: { locker: { select: { memberId: true } } },
      });

      if (!slot) throw new Error("Slot not found");
      if (slot.locker.memberId !== memberId) throw new Error("Not your locker");
      if (!slot.wineId) throw new Error("Slot is already empty");

      // Clear the wine from the slot
      await tx.lockerSlot.update({
        where: { id: slotId },
        data: { wineId: null, dateStored: null },
      });
    });

    revalidatePath("/locker");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to remove wine" };
  }
}
