"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";
import { CreateWineBodySchema, UuidSchema, parseOr400 } from "@/lib/schemas";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { headers } from "next/headers";

const NOT_FOUND_ERROR = { error: "Not found" } as const;
const RATE_LIMITED_ERROR = { error: "Too many requests" } as const;
const MUTATION_POLICY = { limit: 30, windowMs: 60_000 };

async function checkMutationLimit(
  bucket: string,
  memberId: string,
): Promise<boolean> {
  const ip = clientIp(headers());
  const result = await checkRateLimit(
    `${bucket}:${memberId}:${ip}`,
    MUTATION_POLICY,
  );
  return result.allowed;
}

function actionError(e: unknown): { error: string } {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError &&
    e.code === "P2002"
  ) {
    // Wine already in a slot, or any other unique violation. Surface as a
    // generic conflict so we don't leak slot-vs-wine details.
    return { error: "That bottle is already stored in a slot" };
  }
  return NOT_FOUND_ERROR;
}

/**
 * Assign a wine to an empty locker slot.
 * Validates that both the wine and the locker belong to the authenticated
 * member, and that the locker lives in the active facility. Errors collapse
 * to a single "Not found" so callers can't probe ownership via error text.
 */
export async function assignWineToSlot(
  slotId: string,
  wineId: string
): Promise<{ error?: string }> {
  const ctx = await requireMemberFacility();
  if (!ctx) return NOT_FOUND_ERROR;

  if (!UuidSchema.safeParse(slotId).success) return NOT_FOUND_ERROR;
  if (!UuidSchema.safeParse(wineId).success) return NOT_FOUND_ERROR;

  if (!(await checkMutationLimit("locker-assign", ctx.memberId))) {
    return RATE_LIMITED_ERROR;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const slot = await tx.lockerSlot.findFirst({
          where: {
            id: slotId,
            wineId: null,
            locker: {
              memberId: ctx.memberId,
              facilityId: ctx.facilityId,
            },
          },
          select: { id: true },
        });
        if (!slot) throw new Error("not_found");

        const wine = await tx.wine.findFirst({
          where: { id: wineId, memberId: ctx.memberId },
          select: { id: true },
        });
        if (!wine) throw new Error("not_found");

        // The partial unique index on locker_slots.wine_id makes "wine
        // already assigned" a hard DB constraint — caught below as P2002.
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
    return actionError(e);
  }
}

/**
 * Create a new wine and assign it to an empty locker slot in one transaction.
 * Same scoping rules as assignWineToSlot.
 */
export async function addWineAndAssignToSlot(
  slotId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await requireMemberFacility();
  if (!ctx) return NOT_FOUND_ERROR;

  if (!UuidSchema.safeParse(slotId).success) return NOT_FOUND_ERROR;

  if (!(await checkMutationLimit("locker-add-wine", ctx.memberId))) {
    return RATE_LIMITED_ERROR;
  }

  const parsed = parseOr400(CreateWineBodySchema, {
    name: formData.get("name"),
    vintage: formData.get("vintage"),
    region: formData.get("region"),
    varietal: formData.get("varietal"),
    producer: formData.get("producer"),
    purchasePrice: formData.get("purchasePrice"),
  });
  if (!parsed.ok) return { error: "Invalid wine data" };
  const wineData = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.lockerSlot.findFirst({
        where: {
          id: slotId,
          wineId: null,
          locker: {
            memberId: ctx.memberId,
            facilityId: ctx.facilityId,
          },
        },
        select: { id: true },
      });
      if (!slot) throw new Error("not_found");

      const wine = await tx.wine.create({
        data: {
          ...wineData,
          currentValue: wineData.purchasePrice,
          memberId: ctx.memberId,
        },
      });

      await tx.lockerSlot.update({
        where: { id: slotId },
        data: { wineId: wine.id, dateStored: new Date() },
      });
    });

    revalidatePath("/locker");
    revalidatePath("/collection");
    return {};
  } catch (e) {
    return actionError(e);
  }
}

/**
 * Remove a wine from a locker slot.
 */
export async function removeWineFromSlot(
  slotId: string
): Promise<{ error?: string }> {
  const ctx = await requireMemberFacility();
  if (!ctx) return NOT_FOUND_ERROR;

  if (!UuidSchema.safeParse(slotId).success) return NOT_FOUND_ERROR;

  if (!(await checkMutationLimit("locker-remove", ctx.memberId))) {
    return RATE_LIMITED_ERROR;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const slot = await tx.lockerSlot.findFirst({
        where: {
          id: slotId,
          wineId: { not: null },
          locker: {
            memberId: ctx.memberId,
            facilityId: ctx.facilityId,
          },
        },
        select: { id: true },
      });
      if (!slot) throw new Error("not_found");

      await tx.lockerSlot.update({
        where: { id: slot.id },
        data: { wineId: null, dateStored: null },
      });
    });

    revalidatePath("/locker");
    return {};
  } catch {
    return NOT_FOUND_ERROR;
  }
}
