"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

function actionError(e: unknown, fallback: string): { error: string } {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002"
  ) {
    return { error: "Wine is already assigned to a slot" };
  }
  return { error: e instanceof Error ? e.message : fallback };
}

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
    await prisma.$transaction(
      async (tx) => {
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

        // The partial unique index on locker_slots.wine_id (migration 0002)
        // makes "wine already assigned to a slot" a hard DB constraint, so
        // we don't need an application-layer pre-check. The unique violation
        // bubbles up as a Prisma error and gets caught below.
        await tx.lockerSlot.update({
          where: { id: slotId },
          data: { wineId, dateStored: new Date() },
        });
      },
      { isolationLevel: "Serializable" }
    );

    revalidatePath("/locker");
    return {};
  } catch (e) {
    return actionError(e, "Failed to assign wine");
  }
}

/**
 * Create a new wine and assign it to an empty locker slot in one transaction.
 * Validates that the authenticated member owns the locker.
 */
export async function addWineAndAssignToSlot(
  slotId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const memberId = session.user.id;

  const name = (formData.get("name") as string | null)?.trim();
  const vintageRaw = formData.get("vintage") as string | null;
  const region = (formData.get("region") as string | null)?.trim();
  const varietal = (formData.get("varietal") as string | null)?.trim();
  const producer = (formData.get("producer") as string | null)?.trim();
  const priceRaw = formData.get("purchasePrice") as string | null;

  const vintage = vintageRaw ? parseInt(vintageRaw, 10) : NaN;
  const purchasePrice = priceRaw ? parseFloat(priceRaw) : NaN;

  if (!name || name.length > 500 || !region || !varietal || !producer) {
    return { error: "All fields are required" };
  }
  if (isNaN(vintage) || vintage < 1800 || vintage > new Date().getFullYear() + 1) {
    return { error: "Invalid vintage year" };
  }
  if (isNaN(purchasePrice) || purchasePrice < 0 || purchasePrice > 10_000_000) {
    return { error: "Invalid purchase price" };
  }

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

      // Create the wine
      const wine = await tx.wine.create({
        data: {
          name,
          vintage,
          region,
          varietal,
          producer,
          purchasePrice,
          currentValue: purchasePrice,
          memberId,
        },
      });

      // Assign it to the slot
      await tx.lockerSlot.update({
        where: { id: slotId },
        data: { wineId: wine.id, dateStored: new Date() },
      });
    });

    revalidatePath("/locker");
    revalidatePath("/collection");
    return {};
  } catch (e) {
    return actionError(e, "Failed to add wine");
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
