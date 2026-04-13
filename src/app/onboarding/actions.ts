"use server";

import { Prisma, Tier } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

const SLOTS_PER_LOCKER = 32;

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function unauthorized<T = undefined>(): ActionResult<T> {
  return { ok: false, error: "Not authenticated" };
}

/** Step 1 — set the member's preferred tier. */
export async function setOnboardingTier(
  tier: Tier,
): Promise<ActionResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return unauthorized();

  if (!Object.values(Tier).includes(tier)) {
    return { ok: false, error: "Invalid tier" };
  }

  await prisma.member.update({
    where: { id: session.user.id },
    data: { tier },
  });

  return { ok: true };
}

/**
 * Step 2 — reserve a fresh locker for the member.
 *
 * Idempotent: if the member already owns a locker, return its number
 * instead of creating another one. Any other "I'm onboarding" requests
 * to claim a locker after the first one are no-ops.
 *
 * Locker numbers are globally unique, so we pick the next free integer
 * by reading MAX(locker_number). Under contention two simultaneous
 * signups can race and one will hit a P2002 unique violation; we retry
 * once with the bumped number to absorb that.
 */
export async function reserveOnboardingLocker(): Promise<
  ActionResult<{ lockerNumber: number; zone: string }>
> {
  const session = await getServerAuth();
  if (!session?.user?.id) return unauthorized();
  const memberId = session.user.id;

  const existing = await prisma.locker.findFirst({
    where: { memberId },
    select: { lockerNumber: true, zone: true },
    orderBy: { lockerNumber: "asc" },
  });
  if (existing) {
    return {
      ok: true,
      data: { lockerNumber: existing.lockerNumber, zone: existing.zone },
    };
  }

  // Reserve the locker in whichever facility the member already belongs
  // to (signup attaches them to the oldest facility). Falling back to the
  // oldest facility globally covers the edge case where membership is
  // missing — defensive only, signup always creates one.
  const membership = await prisma.facilityMember.findFirst({
    where: { memberId },
    select: { facilityId: true },
    orderBy: { createdAt: "asc" },
  });
  const facilityId =
    membership?.facilityId ??
    (
      await prisma.facility.findFirst({
        select: { id: true },
        orderBy: { createdAt: "asc" },
      })
    )?.id;
  if (!facilityId) {
    return { ok: false, error: "No facility configured" };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const max = await prisma.locker.aggregate({
      _max: { lockerNumber: true },
    });
    const lockerNumber = (max._max.lockerNumber ?? 0) + 1 + attempt;
    const zone = String.fromCharCode(
      65 + (Math.floor((lockerNumber - 1) / 8) % 26),
    );

    try {
      await prisma.locker.create({
        data: {
          lockerNumber,
          zone,
          facilityId,
          memberId,
          slots: {
            create: Array.from({ length: SLOTS_PER_LOCKER }, (_, i) => ({
              slotPosition: i + 1,
            })),
          },
        },
      });
      revalidatePath("/locker");
      return { ok: true, data: { lockerNumber, zone } };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        continue;
      }
      throw e;
    }
  }

  return { ok: false, error: "Could not reserve a locker — please retry" };
}

/**
 * Step 3 (optional) — add the member's first wine and assign it to slot 1
 * of the locker reserved in step 2. Idempotent: if slot 1 is already taken
 * (member retried), pick the next empty slot. If the locker is full,
 * surface an error.
 */
export async function addFirstWine(
  formData: FormData,
): Promise<ActionResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return unauthorized();
  const memberId = session.user.id;

  const name = (formData.get("name") as string | null)?.trim();
  const region = (formData.get("region") as string | null)?.trim();
  const varietal = (formData.get("varietal") as string | null)?.trim();
  const producer = (formData.get("producer") as string | null)?.trim();
  const vintageRaw = formData.get("vintage") as string | null;
  const priceRaw = formData.get("purchasePrice") as string | null;

  const vintage = vintageRaw ? parseInt(vintageRaw, 10) : NaN;
  const purchasePrice = priceRaw ? parseFloat(priceRaw) : NaN;

  if (!name || name.length > 500 || !region || !varietal || !producer) {
    return { ok: false, error: "All fields are required" };
  }
  if (
    isNaN(vintage) ||
    vintage < 1800 ||
    vintage > new Date().getFullYear() + 1
  ) {
    return { ok: false, error: "Invalid vintage year" };
  }
  if (isNaN(purchasePrice) || purchasePrice < 0 || purchasePrice > 10_000_000) {
    return { ok: false, error: "Invalid purchase price" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const locker = await tx.locker.findFirst({
        where: { memberId },
        orderBy: { lockerNumber: "asc" },
        include: {
          slots: {
            where: { wineId: null },
            orderBy: { slotPosition: "asc" },
            take: 1,
          },
        },
      });

      if (!locker) throw new Error("Reserve a locker before adding a wine");
      const slot = locker.slots[0];
      if (!slot) throw new Error("Locker is full");

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

      await tx.lockerSlot.update({
        where: { id: slot.id },
        data: { wineId: wine.id, dateStored: new Date() },
      });
    });

    revalidatePath("/locker");
    revalidatePath("/collection");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to add wine",
    };
  }
}

/** Final step — mark the member as onboarded. Idempotent. */
export async function completeOnboarding(): Promise<ActionResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return unauthorized();

  await prisma.member.update({
    where: { id: session.user.id },
    data: { onboardedAt: new Date() },
  });

  return { ok: true };
}
