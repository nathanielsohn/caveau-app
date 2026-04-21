"use server";

import { revalidatePath } from "next/cache";
import { AllocationRequestStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { RequestAllocationBodySchema, UuidSchema } from "@/lib/schemas";
import {
  decideEligibility,
  isOpenForRequests,
  maxRequestQuantity,
  type MemberEligibilityInput,
} from "@/lib/allocations";

export interface AllocationRequestState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  confirmedQuantity: number | null;
  cancelled: boolean;
}

export const INITIAL_ALLOCATION_REQUEST_STATE: AllocationRequestState = {
  submittedAt: null,
  ok: false,
  error: null,
  confirmedQuantity: null,
  cancelled: false,
};

export async function requestAllocation(
  _prev: AllocationRequestState,
  formData: FormData,
): Promise<AllocationRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in to request an allocation.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    const parsed = RequestAllocationBodySchema.safeParse({
      allocationId: formData.get("allocationId"),
      quantityRequested: formData.get("quantityRequested") ?? 1,
      memberNote: formData.get("memberNote") ?? undefined,
    });
    if (!parsed.success) {
      return {
        submittedAt: now,
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    const { allocationId, quantityRequested, memberNote } = parsed.data;

    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { tier: true, foundingMember: true },
    });
    if (!member) {
      return {
        submittedAt: now,
        ok: false,
        error: "Member not found.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    const memberInput: MemberEligibilityInput = {
      tier: member.tier,
      foundingMember: member.foundingMember,
    };

    const allocation = await prisma.allocation.findUnique({
      where: { id: allocationId },
      include: {
        requests: {
          select: { status: true, quantityRequested: true },
        },
      },
    });
    if (!allocation) {
      return {
        submittedAt: now,
        ok: false,
        error: "Allocation not found.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    const decision = decideEligibility(memberInput, allocation);
    if (!decision.eligible) {
      return {
        submittedAt: now,
        ok: false,
        error: decision.reason,
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    if (!isOpenForRequests(allocation)) {
      return {
        submittedAt: now,
        ok: false,
        error: "Requests are closed for this release.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    const maxQty = maxRequestQuantity(allocation, allocation.requests);
    if (maxQty === 0) {
      return {
        submittedAt: now,
        ok: false,
        error: "This release is fully allocated.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    if (quantityRequested > maxQty) {
      return {
        submittedAt: now,
        ok: false,
        error: `Only ${maxQty} ${maxQty === 1 ? "bottle" : "bottles"} available to request.`,
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    // Upsert on (allocationId, memberId) — if a prior request was
    // cancelled the member can re-request by filing a fresh submission.
    // Decline and accept block re-submission (Prisma throws P2002 on
    // the unique constraint, but we check status first for nicer copy).
    const existing = await prisma.allocationRequest.findUnique({
      where: { allocationId_memberId: { allocationId, memberId } },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== AllocationRequestStatus.cancelled) {
      return {
        submittedAt: now,
        ok: false,
        error:
          existing.status === AllocationRequestStatus.submitted
            ? "You've already requested this allocation."
            : existing.status === AllocationRequestStatus.accepted
              ? "Your request was accepted — check the detail page for next steps."
              : existing.status === AllocationRequestStatus.fulfilled
                ? "This allocation is already in your collection."
                : "This request can't be re-submitted.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    if (existing) {
      await prisma.allocationRequest.update({
        where: { id: existing.id },
        data: {
          status: AllocationRequestStatus.submitted,
          quantityRequested,
          memberNote: memberNote ?? null,
          cancelledAt: null,
          acceptedAt: null,
          declinedAt: null,
          fulfilledAt: null,
          fulfilledById: null,
          staffNote: null,
        },
      });
    } else {
      await prisma.allocationRequest.create({
        data: {
          allocationId,
          memberId,
          quantityRequested,
          memberNote: memberNote ?? null,
        },
      });
    }

    revalidatePath("/allocations");
    revalidatePath(`/allocations/${allocation.slug}`);
    revalidatePath(`/admin/allocations/${allocationId}`);
    revalidatePath("/admin/allocations");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedQuantity: quantityRequested,
      cancelled: false,
    };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        submittedAt: now,
        ok: false,
        error: "You've already requested this allocation.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    logger.error("requestAllocation failed", e, { action: "requestAllocation" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not submit request. Please try again in a moment.",
      confirmedQuantity: null,
      cancelled: false,
    };
  }
}

export async function cancelAllocationRequest(
  _prev: AllocationRequestState,
  formData: FormData,
): Promise<AllocationRequestState> {
  const now = Date.now();
  try {
    const session = await getServerAuth();
    const memberId = session?.user?.id;
    if (!memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Please sign in.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    const idCheck = UuidSchema.safeParse(formData.get("requestId"));
    if (!idCheck.success) {
      return {
        submittedAt: now,
        ok: false,
        error: "Invalid request id.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    const requestId = idCheck.data;

    const existing = await prisma.allocationRequest.findUnique({
      where: { id: requestId },
      include: { allocation: { select: { slug: true } } },
    });
    if (!existing || existing.memberId !== memberId) {
      return {
        submittedAt: now,
        ok: false,
        error: "Request not found.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }
    if (
      existing.status === AllocationRequestStatus.fulfilled ||
      existing.status === AllocationRequestStatus.cancelled ||
      existing.status === AllocationRequestStatus.declined
    ) {
      return {
        submittedAt: now,
        ok: false,
        error: "This request can no longer be cancelled.",
        confirmedQuantity: null,
        cancelled: false,
      };
    }

    await prisma.allocationRequest.update({
      where: { id: requestId },
      data: {
        status: AllocationRequestStatus.cancelled,
        cancelledAt: new Date(),
      },
    });

    revalidatePath("/allocations");
    revalidatePath(`/allocations/${existing.allocation.slug}`);
    revalidatePath(`/admin/allocations/${existing.allocationId}`);
    revalidatePath("/admin/allocations");

    return {
      submittedAt: now,
      ok: true,
      error: null,
      confirmedQuantity: null,
      cancelled: true,
    };
  } catch (e) {
    logger.error("cancelAllocationRequest failed", e, {
      action: "cancelAllocationRequest",
    });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not cancel. Please try again.",
      confirmedQuantity: null,
      cancelled: false,
    };
  }
}
