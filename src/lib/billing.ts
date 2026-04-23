/**
 * Billing sync helpers (feature #27).
 *
 * Primary responsibility: keep the Stripe "storage per slot" subscription
 * item quantity aligned with the number of reserved locker slots for a
 * member (count of locker_slots across all lockers assigned to them).
 *
 * All functions are best-effort and follow the app's "graceful failure
 * when unconfigured" pattern: if Stripe env vars are missing, they return
 * a typed error and never throw.
 */

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getStripeClient } from "@/lib/stripe";
import { logger } from "@/lib/logger";

export async function getReservedSlotCountForMember(memberId: string): Promise<number> {
  // Count locker_slots rows across all lockers assigned to the member.
  // Each locker is seeded with 32 slots, but counting rows makes the
  // billing logic resilient to future variable-capacity lockers.
  return prisma.lockerSlot.count({
    where: { locker: { memberId } },
  });
}

export type SyncStorageQuantityResult =
  | { ok: true; reservedSlots: number; changed: boolean }
  | {
      ok: false;
      code:
        | "stripe_not_configured"
        | "stripe_storage_price_not_configured"
        | "no_subscription";
      error: string;
    };

/**
 * Ensure the member's Stripe subscription storage line item quantity
 * equals their reserved slot count. If the storage item is missing it is
 * created; if the member has zero reserved slots the item is removed.
 *
 * Idempotent: when quantity already matches, no Stripe write occurs.
 */
export async function syncStorageQuantityForMember(
  memberId: string,
): Promise<SyncStorageQuantityResult> {
  const stripe = getStripeClient();
  if (!stripe) {
    return {
      ok: false,
      code: "stripe_not_configured",
      error: "Stripe is not configured.",
    };
  }

  const storagePriceId = env.STRIPE_PRICE_STORAGE_PER_SLOT;
  if (!storagePriceId) {
    return {
      ok: false,
      code: "stripe_storage_price_not_configured",
      error: "Storage billing is not configured.",
    };
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      stripeSubscriptionId: true,
      stripeStorageItemId: true,
    },
  });
  if (!member) {
    return {
      ok: false,
      code: "no_subscription",
      error: "Member not found.",
    };
  }

  const subscriptionId = member.stripeSubscriptionId;
  if (!subscriptionId) {
    return {
      ok: false,
      code: "no_subscription",
      error: "No Stripe subscription on file.",
    };
  }

  const reservedSlots = await getReservedSlotCountForMember(memberId);

  // 0 reserved slots: remove storage item entirely so the invoice reflects
  // the state (Stripe doesn't support quantity=0 as a durable "free" item).
  if (reservedSlots <= 0) {
    if (!member.stripeStorageItemId) {
      return { ok: true, reservedSlots, changed: false };
    }
    try {
      await stripe.subscriptionItems.del(member.stripeStorageItemId);
      await prisma.member.update({
        where: { id: memberId },
        data: { stripeStorageItemId: null },
      });
      return { ok: true, reservedSlots, changed: true };
    } catch (err) {
      logger.error("[billing] failed to remove storage item", err, {
        memberId,
        storageItemId: member.stripeStorageItemId,
      });
      return { ok: true, reservedSlots, changed: false };
    }
  }

  // Non-zero slots: ensure we have a storage item ID, then update its
  // quantity only if it differs.
  let storageItemId = member.stripeStorageItemId;
  let currentQuantity: number | null = null;

  if (storageItemId) {
    try {
      const item = await stripe.subscriptionItems.retrieve(storageItemId);
      // Stripe returns quantity as number | null.
      currentQuantity = typeof item.quantity === "number" ? item.quantity : null;
    } catch {
      // Item may have been deleted manually — clear and rebuild below.
      logger.warn("[billing] storage item lookup failed; rebuilding", {
        memberId,
        storageItemId,
      });
      storageItemId = null;
      currentQuantity = null;
      await prisma.member.update({
        where: { id: memberId },
        data: { stripeStorageItemId: null },
      });
    }
  }

  if (!storageItemId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const found = sub.items.data.find((item) => item.price.id === storagePriceId);
      if (found) {
        storageItemId = found.id;
        currentQuantity = typeof found.quantity === "number" ? found.quantity : null;
        await prisma.member.update({
          where: { id: memberId },
          data: { stripeStorageItemId: storageItemId },
        });
      }
    } catch (err) {
      logger.error("[billing] subscription retrieve failed", err, {
        memberId,
        subscriptionId,
      });
    }
  }

  if (storageItemId && currentQuantity === reservedSlots) {
    return { ok: true, reservedSlots, changed: false };
  }

  if (storageItemId) {
    try {
      await stripe.subscriptionItems.update(storageItemId, {
        quantity: reservedSlots,
        proration_behavior: "none",
      });
      return { ok: true, reservedSlots, changed: true };
    } catch (err) {
      logger.error("[billing] storage item quantity update failed", err, {
        memberId,
        storageItemId,
        reservedSlots,
      });
      return { ok: true, reservedSlots, changed: false };
    }
  }

  // Still no storage item: create one.
  try {
    const item = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: storagePriceId,
      quantity: reservedSlots,
      proration_behavior: "none",
    });
    await prisma.member.update({
      where: { id: memberId },
      data: { stripeStorageItemId: item.id },
    });
    return { ok: true, reservedSlots, changed: true };
  } catch (err) {
    logger.error("[billing] storage item create failed", err, {
      memberId,
      subscriptionId,
      reservedSlots,
    });
    return { ok: true, reservedSlots, changed: false };
  }
}
