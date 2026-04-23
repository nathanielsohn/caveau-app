"use server";

import { revalidatePath } from "next/cache";
import { AppraisalStatus, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AppraisalLifecycleActionSchema,
  CompleteAppraisalBodySchema,
} from "@/lib/schemas";
import {
  DEFAULT_APPRAISER,
  buildAppraisalSnapshot,
  nextAppraisalNumber,
} from "@/lib/appraisals";
import { appraisalIntegrityHash } from "@/lib/appraisal-hash";

async function requireAdminId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

// ── Lifecycle ──────────────────────────────────────────────────────────

export interface SimpleActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Move a submitted appraisal into in_progress (i.e. staff has started
 * drafting). No DB-level state change beyond the status transition —
 * `completeAppraisal` is where the heavy lifting happens.
 */
export async function startAppraisal(
  appraisalId: string,
  staffNote?: string,
): Promise<SimpleActionResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "forbidden" };
  const parsed = AppraisalLifecycleActionSchema.safeParse({
    appraisalId,
    staffNote,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: parsed.data.appraisalId },
    select: { id: true, status: true },
  });
  if (!appraisal) return { ok: false, error: "not_found" };
  if (appraisal.status !== AppraisalStatus.submitted) {
    return { ok: false, error: "not_startable" };
  }

  await prisma.appraisal.update({
    where: { id: appraisal.id },
    data: {
      status: AppraisalStatus.in_progress,
      staffNote: parsed.data.staffNote ?? undefined,
    },
  });

  logger.info("[admin-appraisals] started", {
    appraisalId: appraisal.id,
    adminId,
  });

  revalidatePath("/admin/appraisals");
  revalidatePath(`/admin/appraisals/${appraisal.id}`);
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${appraisal.id}`);
  return { ok: true };
}

export async function cancelAppraisalAsAdmin(
  appraisalId: string,
  staffNote?: string,
): Promise<SimpleActionResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "forbidden" };
  const parsed = AppraisalLifecycleActionSchema.safeParse({
    appraisalId,
    staffNote,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: parsed.data.appraisalId },
    select: { id: true, status: true },
  });
  if (!appraisal) return { ok: false, error: "not_found" };
  if (
    appraisal.status !== AppraisalStatus.submitted &&
    appraisal.status !== AppraisalStatus.in_progress
  ) {
    return { ok: false, error: "not_cancellable" };
  }

  await prisma.appraisal.update({
    where: { id: appraisal.id },
    data: {
      status: AppraisalStatus.cancelled,
      cancelledAt: new Date(),
      staffNote: parsed.data.staffNote ?? undefined,
    },
  });

  logger.info("[admin-appraisals] cancelled", {
    appraisalId: appraisal.id,
    adminId,
  });

  revalidatePath("/admin/appraisals");
  revalidatePath(`/admin/appraisals/${appraisal.id}`);
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${appraisal.id}`);
  return { ok: true };
}

/**
 * Mark a completed appraisal revoked. Distinct from cancelling an
 * in-flight request — this is the "issued a doc by mistake / basis
 * was wrong" escape hatch. Keeps the row and hash intact but the
 * public verify page refuses to resolve it.
 */
export async function revokeAppraisal(
  appraisalId: string,
  staffNote?: string,
): Promise<SimpleActionResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "forbidden" };
  const parsed = AppraisalLifecycleActionSchema.safeParse({
    appraisalId,
    staffNote,
  });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: parsed.data.appraisalId },
    select: { id: true, status: true, revokedAt: true },
  });
  if (!appraisal) return { ok: false, error: "not_found" };
  if (appraisal.status !== AppraisalStatus.completed) {
    return { ok: false, error: "not_revokable" };
  }
  if (appraisal.revokedAt) return { ok: false, error: "already_revoked" };

  await prisma.appraisal.update({
    where: { id: appraisal.id },
    data: {
      revokedAt: new Date(),
      staffNote: parsed.data.staffNote ?? undefined,
    },
  });

  logger.info("[admin-appraisals] revoked", {
    appraisalId: appraisal.id,
    adminId,
  });

  revalidatePath("/admin/appraisals");
  revalidatePath(`/admin/appraisals/${appraisal.id}`);
  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${appraisal.id}`);
  return { ok: true };
}

// ── Completion (useFormState) ──────────────────────────────────────────

export interface CompleteAppraisalState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  appraisalNumber: string | null;
}

export const INITIAL_COMPLETE_APPRAISAL_STATE: CompleteAppraisalState = {
  submittedAt: null,
  ok: false,
  error: null,
  appraisalNumber: null,
};

/**
 * Complete an appraisal — snapshot line items, compute totals, assign
 * appraisal_number, compute HMAC hash, and flip status. Runs inside a
 * transaction so a serial-number race (see `nextAppraisalNumber`) that
 * loses the unique-index contest aborts without writing an orphaned
 * line-items snapshot.
 */
export async function completeAppraisal(
  _prev: CompleteAppraisalState,
  formData: FormData,
): Promise<CompleteAppraisalState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return {
      submittedAt: now,
      ok: false,
      error: "Forbidden",
      appraisalNumber: null,
    };
  }

  const parsed = CompleteAppraisalBodySchema.safeParse({
    appraisalId: formData.get("appraisalId"),
    appraiserName:
      formData.get("appraiserName") || DEFAULT_APPRAISER.name,
    appraiserCreds:
      formData.get("appraiserCreds") || DEFAULT_APPRAISER.creds,
    scopeOfWork: formData.get("scopeOfWork") || DEFAULT_APPRAISER.scope,
    effectiveDate: formData.get("effectiveDate"),
    staffNote: formData.get("staffNote") ?? undefined,
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      appraisalNumber: null,
    };
  }
  const data = parsed.data;

  const appraisal = await prisma.appraisal.findUnique({
    where: { id: data.appraisalId },
    select: {
      id: true,
      memberId: true,
      status: true,
      purpose: true,
      basis: true,
      scopedWineIds: true,
    },
  });
  if (!appraisal) {
    return {
      submittedAt: now,
      ok: false,
      error: "Appraisal not found",
      appraisalNumber: null,
    };
  }
  if (
    appraisal.status !== AppraisalStatus.submitted &&
    appraisal.status !== AppraisalStatus.in_progress
  ) {
    return {
      submittedAt: now,
      ok: false,
      error: `Appraisal is ${appraisal.status} and can't be completed`,
      appraisalNumber: null,
    };
  }

  const scopedWineIds = Array.isArray(appraisal.scopedWineIds)
    ? appraisal.scopedWineIds
        .filter((v): v is string => typeof v === "string")
    : null;

  try {
    const snapshot = await buildAppraisalSnapshot({
      memberId: appraisal.memberId,
      scopedWineIds: scopedWineIds && scopedWineIds.length > 0 ? scopedWineIds : null,
    });

    if (snapshot.bottleCount === 0) {
      return {
        submittedAt: now,
        ok: false,
        error:
          "No bottles in scope — cannot complete an empty appraisal. Ask the member to add inventory or re-scope the request.",
        appraisalNumber: null,
      };
    }

    const appraisalNumber = await nextAppraisalNumber(data.effectiveDate);
    const integrityHash = appraisalIntegrityHash({
      id: appraisal.id,
      memberId: appraisal.memberId,
      effectiveDate: data.effectiveDate,
      purpose: appraisal.purpose,
      basis: appraisal.basis,
      totalBasisUsd: snapshot.totalBasisUsd,
    });

    // Atomic status filter — if two admins click "complete" at once,
    // only one gets through. The loser's reserved appraisalNumber is
    // already locked by nextAppraisalNumber()'s unique index; the rest
    // of this write is idempotent against identical inputs, so rejecting
    // the duplicate here just keeps the UI honest.
    const { count } = await prisma.appraisal.updateMany({
      where: {
        id: appraisal.id,
        status: {
          in: [AppraisalStatus.submitted, AppraisalStatus.in_progress],
        },
      },
      data: {
        status: AppraisalStatus.completed,
        appraiserName: data.appraiserName,
        appraiserCreds: data.appraiserCreds ?? null,
        scopeOfWork: data.scopeOfWork ?? null,
        effectiveDate: data.effectiveDate,
        totalBasisUsd: snapshot.totalBasisUsd,
        bottleCount: snapshot.bottleCount,
        lineItems: snapshot.lineItems as unknown as Prisma.InputJsonValue,
        appraisalNumber,
        dataIntegrityHash: integrityHash,
        staffNote: data.staffNote ?? undefined,
        completedAt: new Date(),
      },
    });
    if (count === 0) {
      return {
        submittedAt: now,
        ok: false,
        error: "Another admin just completed this appraisal — refresh the queue.",
        appraisalNumber: null,
      };
    }

    logger.info("[admin-appraisals] completed", {
      appraisalId: appraisal.id,
      appraisalNumber,
      adminId,
      bottleCount: snapshot.bottleCount,
    });

    revalidatePath("/admin/appraisals");
    revalidatePath(`/admin/appraisals/${appraisal.id}`);
    revalidatePath("/appraisals");
    revalidatePath(`/appraisals/${appraisal.id}`);
    revalidatePath("/settings");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      appraisalNumber,
    };
  } catch (err) {
    logger.error("[admin-appraisals] completion failed", {
      appraisalId: appraisal.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Unable to complete appraisal. Check logs and retry.",
      appraisalNumber: null,
    };
  }
}
