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

  // Verify the slot exists, belongs to the member's locker, and is empty
  const slot = await prisma.lockerSlot.findUnique({
    where: { id: slotId },
    include: { locker: { select: { memberId: true } } },
  });

  if (!slot) return { error: "Slot not found" };
  if (slot.locker.memberId !== memberId) return { error: "Not your locker" };
  if (slot.wineId) return { error: "Slot is already occupied" };

  // Verify the wine belongs to the member and is not already in a slot
  const wine = await prisma.wine.findUnique({
    where: { id: wineId },
    select: { memberId: true },
  });

  if (!wine) return { error: "Wine not found" };
  if (wine.memberId !== memberId) return { error: "Not your wine" };

  const existingSlot = await prisma.lockerSlot.findFirst({
    where: { wineId },
  });
  if (existingSlot) return { error: "Wine is already assigned to a slot" };

  // Assign the wine to the slot
  await prisma.lockerSlot.update({
    where: { id: slotId },
    data: { wineId, dateStored: new Date() },
  });

  revalidatePath("/locker");
  return {};
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

  // Verify the slot exists and belongs to the member's locker
  const slot = await prisma.lockerSlot.findUnique({
    where: { id: slotId },
    include: { locker: { select: { memberId: true } } },
  });

  if (!slot) return { error: "Slot not found" };
  if (slot.locker.memberId !== memberId) return { error: "Not your locker" };
  if (!slot.wineId) return { error: "Slot is already empty" };

  // Clear the wine from the slot
  await prisma.lockerSlot.update({
    where: { id: slotId },
    data: { wineId: null, dateStored: null },
  });

  revalidatePath("/locker");
  return {};
}
