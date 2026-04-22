"use server";

import { revalidatePath } from "next/cache";
import { AcquisitionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RequestAcquisitionBodySchema, UuidSchema } from "@/lib/schemas";
import { isMemberCancellable } from "@/lib/acquisitions";

export interface AcquisitionRequestState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  acquisitionId: string | null;
}

export const INITIAL_ACQUISITION_REQUEST_STATE: AcquisitionRequestState = {
  submittedAt: null,
  ok: false,
  error: null,
  acquisitionId: null,
};

/**
 * Member-submitted acquisition request. Creates the row in `requested`
 * status and leaves sourcing to the admin queue. No margin or cost
 * fields are captured from the member — those are staff-authored at
 * fulfillment and kept admin-only.
 */
export async function requestAcquisition(
  _prev: AcquisitionRequestState,
  formData: FormData,
): Promise<AcquisitionRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to request a bottle.",
        acquisitionId: null,
      };
    }

    const parsed = RequestAcquisitionBodySchema.safeParse({
      producer: formData.get("producer"),
      wineName: formData.get("wineName"),
      vintageExact: formData.get("vintageExact"),
      vintageMin: formData.get("vintageMin"),
      vintageMax: formData.get("vintageMax"),
      region: formData.get("region"),
      varietal: formData.get("varietal"),
      quantity: formData.get("quantity") ?? 1,
      maxBudgetUsd: formData.get("maxBudgetUsd"),
      memberNote: formData.get("memberNote"),
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        acquisitionId: null,
      };
    }
    const data = parsed.data;

    const createData: Prisma.AcquisitionCreateInput = {
      member: { connect: { id: memberId } },
      producer: data.producer,
      wineName: data.wineName ?? null,
      vintageExact: data.vintageExact ?? null,
      vintageMin: data.vintageMin ?? null,
      vintageMax: data.vintageMax ?? null,
      region: data.region ?? null,
      varietal: data.varietal ?? null,
      quantity: data.quantity,
      maxBudgetUsd: data.maxBudgetUsd ?? null,
      memberNote: data.memberNote ?? null,
    };

    const created = await prisma.acquisition.create({
      data: createData,
      select: { id: true },
    });

    logger.info("[acquisitions] request submitted", {
      memberId,
      acquisitionId: created.id,
      producer: data.producer,
      quantity: data.quantity,
    });

    revalidatePath("/acquisitions");
    revalidatePath("/admin/acquisitions");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      acquisitionId: created.id,
    };
  } catch (err) {
    logger.error("[acquisitions] request failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Unable to submit request. Please try again.",
      acquisitionId: null,
    };
  }
}

export async function cancelAcquisitionRequest(
  acquisitionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuth();
  const memberId = session?.user?.id;
  if (!memberId) return { ok: false, error: "unauthenticated" };

  const parsedId = UuidSchema.safeParse(acquisitionId);
  if (!parsedId.success) return { ok: false, error: "invalid_id" };

  const existing = await prisma.acquisition.findFirst({
    where: { id: parsedId.data, memberId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "not_found" };

  if (!isMemberCancellable(existing.status)) {
    return { ok: false, error: "not_cancellable" };
  }

  await prisma.acquisition.update({
    where: { id: existing.id },
    data: {
      status: AcquisitionStatus.cancelled,
      cancelledAt: new Date(),
    },
  });

  revalidatePath("/acquisitions");
  revalidatePath(`/acquisitions/${existing.id}`);
  revalidatePath("/admin/acquisitions");

  return { ok: true };
}
