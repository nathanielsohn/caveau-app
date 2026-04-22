"use server";

import { revalidatePath } from "next/cache";
import { AppraisalStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RequestAppraisalBodySchema, UuidSchema } from "@/lib/schemas";
import { checkWelcomeEligibility, resolveAppraisalPrice } from "@/lib/appraisals";

// ── Request appraisal (useFormState) ───────────────────────────────────

export interface AppraisalRequestState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  appraisalId: string | null;
}

export const INITIAL_APPRAISAL_REQUEST_STATE: AppraisalRequestState = {
  submittedAt: null,
  ok: false,
  error: null,
  appraisalId: null,
};

/**
 * Member-submitted request for an appraisal. Creates the row in the
 * submitted state and leaves fulfillment to the admin queue.
 *
 * `requestWelcome` is a hint from the client — a founding member
 * claiming their freebie. We re-check eligibility server-side via
 * `checkWelcomeEligibility` and only honor the flag if the member truly
 * qualifies; a misuse just silently downgrades to a regular paid
 * request (so the UI never ends up in an inconsistent "pending
 * welcome" state for a non-founding user).
 */
export async function requestAppraisal(
  _prev: AppraisalRequestState,
  formData: FormData,
): Promise<AppraisalRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to request an appraisal.",
        appraisalId: null,
      };
    }

    // FormData carries heirs and scopedWineIds as repeated keys. Zod
    // only sees one value via `get`, so we pull them via `getAll` and
    // shape into the schema's expected structure before parsing.
    const heirNames = formData.getAll("heirName");
    const heirShares = formData.getAll("heirShare");
    const heirs = heirNames
      .map((name, i) => {
        const n = typeof name === "string" ? name.trim() : "";
        const s =
          typeof heirShares[i] === "string"
            ? (heirShares[i] as string).trim()
            : "";
        return { name: n, share: s };
      })
      .filter((h) => h.name.length > 0 && h.share.length > 0);

    const scopedWineIds = formData
      .getAll("scopedWineIds")
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);

    const parsed = RequestAppraisalBodySchema.safeParse({
      purpose: formData.get("purpose"),
      basis: formData.get("basis"),
      memberNote: formData.get("memberNote") ?? undefined,
      scopedWineIds: scopedWineIds.length > 0 ? scopedWineIds : undefined,
      heirs: heirs.length > 0 ? heirs : undefined,
      requestWelcome: formData.get("requestWelcome") ?? false,
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        appraisalId: null,
      };
    }
    const data = parsed.data;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { tier: true, foundingMember: true },
    });
    if (!member) {
      return {
        submittedAt: now,
        ok: false,
        error: "Member not found.",
        appraisalId: null,
      };
    }

    // Only grant welcome pricing if the member truly qualifies.
    let isWelcomeAppraisal = false;
    if (data.requestWelcome) {
      const decision = await checkWelcomeEligibility(
        memberId,
        member.foundingMember,
      );
      isWelcomeAppraisal = decision.eligible;
    }

    const price = resolveAppraisalPrice(member.tier, isWelcomeAppraisal);

    const createData: Prisma.AppraisalCreateInput = {
      member: { connect: { id: memberId } },
      status: AppraisalStatus.submitted,
      purpose: data.purpose,
      basis: data.basis,
      memberNote: data.memberNote ?? null,
      priceChargedUsd: price.priceUsd,
      isWelcomeAppraisal,
    };
    if (data.scopedWineIds && data.scopedWineIds.length > 0) {
      createData.scopedWineIds = data.scopedWineIds;
    }
    if (data.heirs && data.heirs.length > 0) {
      createData.heirs = data.heirs as unknown as Prisma.InputJsonValue;
    }
    const created = await prisma.appraisal.create({
      data: createData,
      select: { id: true },
    });

    logger.info("[appraisals] request submitted", {
      memberId,
      appraisalId: created.id,
      purpose: data.purpose,
      basis: data.basis,
      isWelcomeAppraisal,
    });

    revalidatePath("/appraisals");
    revalidatePath("/");
    revalidatePath("/settings");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      appraisalId: created.id,
    };
  } catch (err) {
    logger.error("[appraisals] request failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Unable to submit request. Please try again.",
      appraisalId: null,
    };
  }
}

// ── Cancel submitted request ──────────────────────────────────────────

export async function cancelAppraisalRequest(
  appraisalId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getServerAuth();
  const memberId = session?.user?.id;
  if (!memberId) return { ok: false, error: "unauthenticated" };

  const parsedId = UuidSchema.safeParse(appraisalId);
  if (!parsedId.success) return { ok: false, error: "invalid_id" };

  const existing = await prisma.appraisal.findFirst({
    where: { id: parsedId.data, memberId },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "not_found" };

  // Members can only cancel while their request is still in the
  // front-of-queue states. Once staff has completed the document it's
  // an attested record; cancellation there would be a staff-side
  // revocation, not a member action.
  if (
    existing.status !== AppraisalStatus.submitted &&
    existing.status !== AppraisalStatus.in_progress
  ) {
    return { ok: false, error: "not_cancellable" };
  }

  await prisma.appraisal.update({
    where: { id: existing.id },
    data: {
      status: AppraisalStatus.cancelled,
      cancelledAt: new Date(),
    },
  });

  revalidatePath("/appraisals");
  revalidatePath(`/appraisals/${existing.id}`);
  revalidatePath("/settings");

  return { ok: true };
}
