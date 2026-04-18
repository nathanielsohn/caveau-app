"use server";

import { Prisma, Tier } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { CreateWineBodySchema, parseOr400 } from "@/lib/schemas";
import { isFoundingWindowOpen } from "@/lib/tiers";

const SLOTS_PER_LOCKER = 32;

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

function unauthorized<T = undefined>(): ActionResult<T> {
  return { ok: false, error: "Not authenticated" };
}

function alreadyOnboarded<T = undefined>(): ActionResult<T> {
  return { ok: false, error: "Onboarding already complete" };
}

/**
 * Resolve the caller and assert they are still mid-onboarding. Once a member
 * finishes the wizard their `onboardedAt` is set; after that, every wizard
 * action becomes a no-op so a malicious client cannot replay step 1 to
 * upgrade tier, or step 2 to reserve a second locker.
 */
async function requirePendingMember(): Promise<
  | { ok: true; memberId: string }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true },
  });
  if (!member) return { ok: false, error: "Not authenticated" };
  if (member.onboardedAt) return { ok: false, error: "Onboarding already complete" };
  return { ok: true, memberId: session.user.id };
}

/** Step 1 — set the member's preferred tier. */
export async function setOnboardingTier(
  tier: Tier,
): Promise<ActionResult> {
  const gate = await requirePendingMember();
  if (!gate.ok) return gate;

  if (!Object.values(Tier).includes(tier)) {
    return { ok: false, error: "Invalid tier" };
  }

  await prisma.member.update({
    where: { id: gate.memberId },
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
  const gate = await requirePendingMember();
  if (!gate.ok) return gate as ActionResult<{ lockerNumber: number; zone: string }>;
  const memberId = gate.memberId;

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

  // Locker numbers are unique PER facility (migration 0008). Read MAX once
  // and increment locally on retry — the previous loop re-queried on every
  // attempt, which under concurrent signups would have been quadratic.
  const max = await prisma.locker.aggregate({
    where: { facilityId },
    _max: { lockerNumber: true },
  });
  const baseLockerNumber = (max._max.lockerNumber ?? 0) + 1;

  for (let attempt = 0; attempt < 3; attempt++) {
    const lockerNumber = baseLockerNumber + attempt;
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
  const gate = await requirePendingMember();
  if (!gate.ok) return gate;
  const memberId = gate.memberId;

  const parsed = parseOr400(CreateWineBodySchema, {
    name: formData.get("name"),
    vintage: formData.get("vintage"),
    region: formData.get("region"),
    varietal: formData.get("varietal"),
    producer: formData.get("producer"),
    purchasePrice: formData.get("purchasePrice"),
  });
  if (!parsed.ok) return { ok: false, error: "Invalid wine data" };

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
          ...parsed.data,
          currentValue: parsed.data.purchasePrice,
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

/**
 * Final step — mark the member as onboarded. Atomic: only flips the column
 * when it's still null, so a replay can't reset onboardedAt or signal
 * "I just onboarded" twice.
 *
 * Also stamps the founding-member flag + lock timestamp here (#54) if the
 * founding window is still open. Lock happens at completion rather than
 * tier selection so a member who bounces mid-wizard doesn't consume the
 * discount until they've committed.
 */
export async function completeOnboarding(): Promise<ActionResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return unauthorized();

  const now = new Date();
  const foundingData = isFoundingWindowOpen(now)
    ? { foundingMember: true, foundingLockedAt: now }
    : {};

  const result = await prisma.member.updateMany({
    where: { id: session.user.id, onboardedAt: null },
    data: { onboardedAt: now, ...foundingData },
  });
  if (result.count === 0) return alreadyOnboarded();

  return { ok: true };
}
