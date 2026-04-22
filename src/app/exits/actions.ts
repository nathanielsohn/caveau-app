"use server";

import { revalidatePath } from "next/cache";
import { ExitStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  RequestExitFacilitationBodySchema,
  UuidSchema,
} from "@/lib/schemas";
import { isMemberCancellable } from "@/lib/exits";

export interface ExitRequestState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  exitId: string | null;
}

export const INITIAL_EXIT_REQUEST_STATE: ExitRequestState = {
  submittedAt: null,
  ok: false,
  error: null,
  exitId: null,
};

/**
 * Member-submitted exit facilitation request. Creates the row in
 * `requested` status; staff pick up from the admin queue to list and
 * close. Commission math is staff-authored at close, not captured here
 * — mirrors the #62 acquisitions contract where margin is admin-only.
 *
 * Guards:
 *   - wine must be owned by the session member
 *   - wine must be `in_cellar` (can't exit a bottle that's already sold)
 *   - no non-terminal facilitation already open on the wine (DB partial
 *     unique index is the backstop; this is the friendly preflight)
 */
export async function requestExitFacilitation(
  _prev: ExitRequestState,
  formData: FormData,
): Promise<ExitRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to request an exit.",
        exitId: null,
      };
    }

    const parsed = RequestExitFacilitationBodySchema.safeParse({
      wineId: formData.get("wineId"),
      memberNote: formData.get("memberNote"),
      targetPriceLow: formData.get("targetPriceLow"),
      targetPriceHigh: formData.get("targetPriceHigh"),
      preferredChannel: formData.get("preferredChannel"),
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        exitId: null,
      };
    }
    const data = parsed.data;

    // Ownership + status preflight. Doing it here instead of a raw
    // `create` gives us a user-visible error instead of a FK/partial-
    // unique failure surfaced as a generic 500.
    const wine = await prisma.wine.findFirst({
      where: { id: data.wineId, memberId },
      select: { id: true, status: true },
    });
    if (!wine) {
      return {
        submittedAt: now,
        ok: false,
        error: "Bottle not found in your collection.",
        exitId: null,
      };
    }
    if (wine.status !== "in_cellar") {
      return {
        submittedAt: now,
        ok: false,
        error: "This bottle has already left the cellar.",
        exitId: null,
      };
    }

    const activeExisting = await prisma.exitFacilitation.findFirst({
      where: {
        wineId: data.wineId,
        status: { in: [ExitStatus.requested, ExitStatus.listed] },
      },
      select: { id: true, status: true },
    });
    if (activeExisting) {
      return {
        submittedAt: now,
        ok: false,
        error:
          activeExisting.status === ExitStatus.listed
            ? "This bottle is already listed — contact your concierge to adjust."
            : "You already have an exit request open for this bottle.",
        exitId: null,
      };
    }

    // Sanity: if both target prices provided, low ≤ high
    if (
      data.targetPriceLow != null &&
      data.targetPriceHigh != null &&
      data.targetPriceLow > data.targetPriceHigh
    ) {
      return {
        submittedAt: now,
        ok: false,
        error: "Target low must be at or below target high.",
        exitId: null,
      };
    }

    const createData: Prisma.ExitFacilitationCreateInput = {
      wine: { connect: { id: data.wineId } },
      member: { connect: { id: memberId } },
      memberNote: data.memberNote ?? null,
      targetPriceLow: data.targetPriceLow ?? null,
      targetPriceHigh: data.targetPriceHigh ?? null,
      preferredChannel: data.preferredChannel ?? null,
    };

    const created = await prisma.exitFacilitation.create({
      data: createData,
      select: { id: true },
    });

    logger.info("[exits] request submitted", {
      memberId,
      exitId: created.id,
      wineId: data.wineId,
    });

    revalidatePath("/exits");
    revalidatePath("/admin/exits");
    revalidatePath(`/wine/${data.wineId}`);
    revalidatePath("/");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      exitId: created.id,
    };
  } catch (err) {
    logger.error("[exits] request failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Unable to submit request. Please try again.",
      exitId: null,
    };
  }
}

export async function cancelExitFacilitation(
  exitId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuth();
  const memberId = session?.user?.id;
  if (!memberId) return { ok: false, error: "unauthenticated" };

  const parsedId = UuidSchema.safeParse(exitId);
  if (!parsedId.success) return { ok: false, error: "invalid_id" };

  const existing = await prisma.exitFacilitation.findFirst({
    where: { id: parsedId.data, memberId },
    select: { id: true, status: true, wineId: true },
  });
  if (!existing) return { ok: false, error: "not_found" };

  if (!isMemberCancellable(existing.status)) {
    return { ok: false, error: "not_cancellable" };
  }

  await prisma.exitFacilitation.update({
    where: { id: existing.id },
    data: {
      status: ExitStatus.cancelled,
      cancelledAt: new Date(),
    },
  });

  revalidatePath("/exits");
  revalidatePath(`/exits/${existing.id}`);
  revalidatePath("/admin/exits");
  revalidatePath(`/wine/${existing.wineId}`);

  return { ok: true };
}
