"use server";

import { revalidatePath } from "next/cache";
import { AcquisitionStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  DeclineAcquisitionSchema,
  FulfillAcquisitionSchema,
  StartAcquisitionSourcingSchema,
  UuidSchema,
} from "@/lib/schemas";
import {
  canTransitionAcquisition,
  computeMargin,
  formatAcquisitionSpec,
  formatVintage,
} from "@/lib/acquisitions";

export interface AdminAcquisitionFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const INITIAL_ADMIN_ACQUISITION_STATE: AdminAcquisitionFormState = {
  submittedAt: null,
  ok: false,
  error: null,
  message: null,
};

async function requireAdminId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

class InvalidStateError extends Error {}

// ── Start sourcing ─────────────────────────────────────────────────────

export async function startSourcing(
  _prev: AdminAcquisitionFormState,
  formData: FormData,
): Promise<AdminAcquisitionFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = StartAcquisitionSourcingSchema.safeParse({
    acquisitionId: formData.get("acquisitionId"),
    estimatedTotalUsd: formData.get("estimatedTotalUsd"),
    staffNote: formData.get("staffNote"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { acquisitionId, estimatedTotalUsd, staffNote } = parsed.data;

  try {
    const existing = await prisma.acquisition.findUnique({
      where: { id: acquisitionId },
      select: { status: true },
    });
    if (!existing) throw new InvalidStateError("Request not found");
    if (!canTransitionAcquisition(existing.status, AcquisitionStatus.sourcing)) {
      throw new InvalidStateError("Only new requests can move to sourcing.");
    }

    await prisma.acquisition.update({
      where: { id: acquisitionId },
      data: {
        status: AcquisitionStatus.sourcing,
        sourcingStartedAt: new Date(),
        estimatedTotalUsd: estimatedTotalUsd ?? null,
        staffNote: staffNote ?? null,
      },
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("startSourcing failed", e, { action: "startSourcing" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not start sourcing.",
      message: null,
    };
  }

  revalidateAcquisitionPaths(acquisitionId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Sourcing started — member notified.",
  };
}

// ── Fulfill ────────────────────────────────────────────────────────────

export async function fulfillAcquisition(
  _prev: AdminAcquisitionFormState,
  formData: FormData,
): Promise<AdminAcquisitionFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = FulfillAcquisitionSchema.safeParse({
    acquisitionId: formData.get("acquisitionId"),
    source: formData.get("source"),
    actualCostUsd: formData.get("actualCostUsd"),
    memberPriceUsd: formData.get("memberPriceUsd"),
    staffNote: formData.get("staffNote"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { acquisitionId, source, actualCostUsd, memberPriceUsd, staffNote } =
    parsed.data;

  let createdCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const acquisition = await tx.acquisition.findUnique({
        where: { id: acquisitionId },
      });
      if (!acquisition) throw new InvalidStateError("Request not found");
      if (
        !canTransitionAcquisition(
          acquisition.status,
          AcquisitionStatus.fulfilled,
        )
      ) {
        throw new InvalidStateError("Only sourcing requests can be fulfilled.");
      }

      const margin = computeMargin({ actualCostUsd, memberPriceUsd });

      // Build the Wine rows. `purchasePrice` is the per-bottle share of
      // the member's total price — same convention as the rest of the
      // app (Wine.purchasePrice is what the member paid). Name combines
      // producer + wineName if present; otherwise just producer. Vintage
      // falls back to `vintageExact`, then range midpoint, then the
      // current year as a last resort so the non-null Int column is
      // always populated.
      const pricePerBottle = Number(
        (memberPriceUsd / acquisition.quantity).toFixed(2),
      );
      const name = acquisition.wineName
        ? `${acquisition.producer} ${acquisition.wineName}`.slice(0, 500)
        : acquisition.producer.slice(0, 500);
      const vintage = resolveVintage(acquisition);
      const region = acquisition.region ?? "Unspecified";
      const varietal = acquisition.varietal ?? "Unspecified";

      const wineRows = Array.from(
        { length: acquisition.quantity },
        () => ({
          name,
          vintage,
          region,
          varietal,
          producer: acquisition.producer,
          purchasePrice: pricePerBottle,
          currentValue: pricePerBottle,
          tastingNotes: `Acquired via Caveau sourcing. ${formatAcquisitionSpec(acquisition)}`,
          memberId: acquisition.memberId,
          sourceAcquisitionId: acquisition.id,
        }),
      );
      await tx.wine.createMany({ data: wineRows });

      await tx.acquisition.update({
        where: { id: acquisitionId },
        data: {
          status: AcquisitionStatus.fulfilled,
          source,
          actualCostUsd,
          memberPriceUsd,
          marginUsd: margin.marginUsd,
          staffNote: staffNote ?? acquisition.staffNote ?? null,
          fulfilledAt: new Date(),
          fulfilledById: adminId,
        },
      });

      createdCount = wineRows.length;
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("fulfillAcquisition failed", e, {
      action: "fulfillAcquisition",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not fulfill request.",
      message: null,
    };
  }

  revalidateAcquisitionPaths(acquisitionId);
  revalidatePath("/collection");
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: `Fulfilled · ${createdCount} ${createdCount === 1 ? "wine" : "wines"} added to the member's collection.`,
  };
}

// ── Decline ────────────────────────────────────────────────────────────

export async function declineAcquisition(
  _prev: AdminAcquisitionFormState,
  formData: FormData,
): Promise<AdminAcquisitionFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = DeclineAcquisitionSchema.safeParse({
    acquisitionId: formData.get("acquisitionId"),
    staffNote: formData.get("staffNote"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { acquisitionId, staffNote } = parsed.data;

  try {
    const existing = await prisma.acquisition.findUnique({
      where: { id: acquisitionId },
      select: { status: true },
    });
    if (!existing) throw new InvalidStateError("Request not found");
    if (
      !canTransitionAcquisition(existing.status, AcquisitionStatus.declined)
    ) {
      throw new InvalidStateError("This request can no longer be declined.");
    }

    await prisma.acquisition.update({
      where: { id: acquisitionId },
      data: {
        status: AcquisitionStatus.declined,
        declinedAt: new Date(),
        staffNote,
      },
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("declineAcquisition failed", e, {
      action: "declineAcquisition",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not decline.",
      message: null,
    };
  }

  revalidateAcquisitionPaths(acquisitionId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Request declined — member notified via the detail page.",
  };
}

// ── Save staff note without changing status ────────────────────────────

export async function updateAcquisitionNote(
  _prev: AdminAcquisitionFormState,
  formData: FormData,
): Promise<AdminAcquisitionFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("acquisitionId"));
  if (!idCheck.success) {
    return {
      submittedAt: now,
      ok: false,
      error: "Invalid acquisition id.",
      message: null,
    };
  }
  const rawNote = formData.get("staffNote");
  const staffNote =
    typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, 1000)
      : null;

  try {
    await prisma.acquisition.update({
      where: { id: idCheck.data },
      data: { staffNote },
    });
  } catch (e) {
    logger.error("updateAcquisitionNote failed", e, {
      action: "updateAcquisitionNote",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not save note.",
      message: null,
    };
  }

  revalidateAcquisitionPaths(idCheck.data);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Note saved.",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function revalidateAcquisitionPaths(acquisitionId: string) {
  revalidatePath("/admin/acquisitions");
  revalidatePath(`/admin/acquisitions/${acquisitionId}`);
  revalidatePath("/acquisitions");
  revalidatePath(`/acquisitions/${acquisitionId}`);
}

/**
 * Pick a concrete vintage for the sourced Wine rows. The request spec
 * may carry an exact year, a range, or nothing — but Wine.vintage is
 * non-null. Exact wins; otherwise midpoint of the range; otherwise
 * current year. The formatted vintage still appears on the Wine row's
 * tasting note via `formatAcquisitionSpec` so the original ask is not
 * lost.
 */
function resolveVintage(a: {
  vintageExact: number | null;
  vintageMin: number | null;
  vintageMax: number | null;
}): number {
  if (a.vintageExact != null) return a.vintageExact;
  if (a.vintageMin != null && a.vintageMax != null) {
    return Math.round((a.vintageMin + a.vintageMax) / 2);
  }
  if (a.vintageMin != null) return a.vintageMin;
  if (a.vintageMax != null) return a.vintageMax;
  // Last-resort fallback — never hit in practice because the vintage
  // info available to staff at fulfillment time is always richer than
  // at request time.
  void formatVintage;
  return new Date().getFullYear();
}
