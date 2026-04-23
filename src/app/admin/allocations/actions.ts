"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  AllocationRequestStatus,
  AllocationStatus,
  Prisma,
  Role,
  Tier,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  AllocationRequestActionBodySchema,
  CreateAllocationBodySchema,
  UuidSchema,
} from "@/lib/schemas";
import {
  bottlesRemaining,
  canTransitionRequest,
  isOpenForRequests,
} from "@/lib/allocations";
import { notifyEligibleOnPublish } from "@/lib/notify-allocation";

export interface AdminAllocationFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const INITIAL_ADMIN_ALLOCATION_STATE: AdminAllocationFormState = {
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

function readCreateBody(formData: FormData) {
  return {
    slug: formData.get("slug"),
    producer: formData.get("producer"),
    wineName: formData.get("wineName"),
    vintage: formData.get("vintage"),
    region: formData.get("region"),
    varietal: formData.get("varietal"),
    description: formData.get("description") ?? undefined,
    tastingNotes: formData.get("tastingNotes") ?? undefined,
    quantity: formData.get("quantity"),
    pricePerBottleUsd: formData.get("pricePerBottleUsd"),
    minimumTier: formData.get("minimumTier"),
    foundingOnly: formData.get("foundingOnly") ?? false,
    foundingEarlyAccess: formData.get("foundingEarlyAccess") ?? false,
    heroImageKey: formData.get("heroImageKey") ?? undefined,
    opensAt: formData.get("opensAt"),
    closesAt: formData.get("closesAt"),
    status: formData.get("status") ?? "draft",
  };
}

export async function createAllocation(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = CreateAllocationBodySchema.safeParse(readCreateBody(formData));
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const data = parsed.data;

  let created;
  try {
    created = await prisma.allocation.create({
      data: {
        slug: data.slug,
        producer: data.producer,
        wineName: data.wineName,
        vintage: data.vintage,
        region: data.region,
        varietal: data.varietal,
        description: data.description ?? null,
        tastingNotes: data.tastingNotes ?? null,
        quantity: data.quantity,
        pricePerBottleUsd: data.pricePerBottleUsd,
        minimumTier: data.minimumTier as Tier,
        foundingOnly: data.foundingOnly,
        foundingEarlyAccess: data.foundingEarlyAccess,
        heroImageKey: data.heroImageKey ?? null,
        opensAt: data.opensAt,
        closesAt: data.closesAt,
        status:
          data.status === "published"
            ? AllocationStatus.published
            : AllocationStatus.draft,
        publishedAt:
          data.status === "published" ? new Date() : null,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return {
        submittedAt: now,
        ok: false,
        error: "An allocation with that slug already exists.",
        message: null,
      };
    }
    logger.error("createAllocation failed", e, { action: "createAllocation" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not create allocation.",
      message: null,
    };
  }

  if (created.status === AllocationStatus.published) {
    // Deferred — don't block the redirect on email dispatch.
    void notifyEligibleOnPublish(created.id);
  }

  revalidatePath("/admin/allocations");
  revalidatePath("/allocations");
  redirect(`/admin/allocations/${created.id}`);
}

export async function publishAllocation(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("allocationId"));
  if (!idCheck.success) {
    return {
      submittedAt: now,
      ok: false,
      error: "Invalid allocation id.",
      message: null,
    };
  }
  const allocationId = idCheck.data;

  try {
    const allocation = await prisma.allocation.findUnique({
      where: { id: allocationId },
      select: { status: true, slug: true },
    });
    if (!allocation) {
      return {
        submittedAt: now,
        ok: false,
        error: "Allocation not found.",
        message: null,
      };
    }
    if (allocation.status !== AllocationStatus.draft) {
      return {
        submittedAt: now,
        ok: false,
        error: "Only drafts can be published.",
        message: null,
      };
    }

    await prisma.allocation.update({
      where: { id: allocationId },
      data: {
        status: AllocationStatus.published,
        publishedAt: new Date(),
      },
    });

    void notifyEligibleOnPublish(allocationId);

    revalidatePath("/admin/allocations");
    revalidatePath(`/admin/allocations/${allocationId}`);
    revalidatePath("/allocations");
    revalidatePath(`/allocations/${allocation.slug}`);
  } catch (e) {
    logger.error("publishAllocation failed", e, { action: "publishAllocation" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not publish.",
      message: null,
    };
  }

  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Allocation published.",
  };
}

export async function closeAllocation(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("allocationId"));
  if (!idCheck.success) {
    return {
      submittedAt: now,
      ok: false,
      error: "Invalid allocation id.",
      message: null,
    };
  }
  const allocationId = idCheck.data;

  try {
    await prisma.$transaction(async (tx) => {
      const allocation = await tx.allocation.findUnique({
        where: { id: allocationId },
        select: { status: true, slug: true },
      });
      if (!allocation) throw new InvalidStateError("Allocation not found");
      if (allocation.status !== AllocationStatus.published) {
        throw new InvalidStateError(
          "Only published allocations can be closed.",
        );
      }

      // Auto-decline any still-pending requests so no one is left in
      // "submitted" purgatory after the window shuts.
      await tx.allocationRequest.updateMany({
        where: {
          allocationId,
          status: AllocationRequestStatus.submitted,
        },
        data: {
          status: AllocationRequestStatus.declined,
          declinedAt: new Date(),
          staffNote: "Auto-declined when the allocation closed.",
        },
      });

      await tx.allocation.update({
        where: { id: allocationId },
        data: {
          status: AllocationStatus.closed,
          closedAt: new Date(),
        },
      });
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("closeAllocation failed", e, { action: "closeAllocation" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not close.",
      message: null,
    };
  }

  revalidatePath("/admin/allocations");
  revalidatePath(`/admin/allocations/${allocationId}`);
  revalidatePath("/allocations");

  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Allocation closed.",
  };
}

// ── Per-request actions ──────────────────────────────────────────────────

export async function acceptRequest(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = AllocationRequestActionBodySchema.safeParse({
    requestId: formData.get("requestId"),
    staffNote: formData.get("staffNote") ?? undefined,
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { requestId, staffNote } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.allocationRequest.findUnique({
        where: { id: requestId },
        include: {
          allocation: {
            select: {
              id: true,
              quantity: true,
              status: true,
              closesAt: true,
            },
          },
        },
      });
      if (!req) throw new InvalidStateError("Request not found");

      // Serialize all accept/fulfill decisions for this allocation
      // against the parent row. Without this, two concurrent accept
      // clicks against DIFFERENT requests under the same allocation
      // can both pass the `remaining` check at Read Committed and
      // over-commit inventory. The status-filter on the updateMany
      // below only catches the same-request race.
      await tx.$queryRaw`SELECT id FROM allocations WHERE id = ${req.allocation.id}::uuid FOR UPDATE`;

      if (!isOpenForRequests(req.allocation)) {
        throw new InvalidStateError(
          "Allocation is closed — re-open before accepting.",
        );
      }

      // Invariant check: claimed + this request must not exceed quantity.
      // Read all accepted/fulfilled requests AFTER the row lock above.
      const siblings = await tx.allocationRequest.findMany({
        where: {
          allocationId: req.allocation.id,
          status: {
            in: [
              AllocationRequestStatus.accepted,
              AllocationRequestStatus.fulfilled,
            ],
          },
        },
        select: { status: true, quantityRequested: true },
      });
      const remaining = bottlesRemaining(req.allocation, siblings);
      if (req.quantityRequested > remaining) {
        throw new InvalidStateError(
          `Only ${remaining} ${remaining === 1 ? "bottle" : "bottles"} left — this request is for ${req.quantityRequested}.`,
        );
      }

      const { count } = await tx.allocationRequest.updateMany({
        where: {
          id: requestId,
          status: AllocationRequestStatus.submitted,
        },
        data: {
          status: AllocationRequestStatus.accepted,
          acceptedAt: new Date(),
          staffNote: staffNote ?? null,
        },
      });
      if (count === 0) {
        throw new InvalidStateError("This request can't be accepted.");
      }
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("acceptRequest failed", e, { action: "acceptRequest" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not accept.",
      message: null,
    };
  }

  revalidatePathsForRequest(requestId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Request accepted.",
  };
}

export async function declineRequest(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = AllocationRequestActionBodySchema.safeParse({
    requestId: formData.get("requestId"),
    staffNote: formData.get("staffNote") ?? undefined,
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { requestId, staffNote } = parsed.data;

  try {
    const req = await prisma.allocationRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    if (!req) {
      return {
        submittedAt: now,
        ok: false,
        error: "Request not found",
        message: null,
      };
    }
    if (
      !canTransitionRequest(req.status, AllocationRequestStatus.declined)
    ) {
      return {
        submittedAt: now,
        ok: false,
        error: "This request can't be declined.",
        message: null,
      };
    }

    await prisma.allocationRequest.update({
      where: { id: requestId },
      data: {
        status: AllocationRequestStatus.declined,
        declinedAt: new Date(),
        staffNote: staffNote ?? null,
      },
    });
  } catch (e) {
    logger.error("declineRequest failed", e, { action: "declineRequest" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not decline.",
      message: null,
    };
  }

  revalidatePathsForRequest(requestId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Request declined.",
  };
}

export async function fulfillRequest(
  _prev: AdminAllocationFormState,
  formData: FormData,
): Promise<AdminAllocationFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("requestId"));
  if (!idCheck.success) {
    return {
      submittedAt: now,
      ok: false,
      error: "Invalid request id.",
      message: null,
    };
  }
  const requestId = idCheck.data;

  let createdCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const req = await tx.allocationRequest.findUnique({
        where: { id: requestId },
        include: {
          allocation: true,
        },
      });
      if (!req) throw new InvalidStateError("Request not found");
      if (
        !canTransitionRequest(
          req.status,
          AllocationRequestStatus.fulfilled,
        )
      ) {
        throw new InvalidStateError(
          "Only accepted requests can be fulfilled.",
        );
      }

      // Write one Wine row per bottle in the accepted quantity, with the
      // allocation as the provenance back-link. No locker slot assignment —
      // staff places bottles at physical intake (mirrors MigrationRequest
      // fulfillment, which also doesn't auto-slot).
      const a = req.allocation;
      const wineRows = Array.from({ length: req.quantityRequested }, () => ({
        name: `${a.producer} ${a.wineName}`.slice(0, 500),
        vintage: a.vintage,
        region: a.region,
        varietal: a.varietal,
        producer: a.producer,
        purchasePrice: a.pricePerBottleUsd,
        currentValue: a.pricePerBottleUsd,
        tastingNotes: a.tastingNotes,
        memberId: req.memberId,
        sourceAllocationId: a.id,
      }));
      await tx.wine.createMany({ data: wineRows });

      // Atomic status transition guards against a concurrent double-click
      // doubling the member's wine rows — the second transaction's count
      // will be 0 and the whole txn (wine inserts included) rolls back.
      const { count } = await tx.allocationRequest.updateMany({
        where: {
          id: requestId,
          status: AllocationRequestStatus.accepted,
        },
        data: {
          status: AllocationRequestStatus.fulfilled,
          fulfilledAt: new Date(),
          fulfilledById: adminId,
        },
      });
      if (count === 0) {
        throw new InvalidStateError(
          "Another admin just fulfilled this request — refresh the queue.",
        );
      }

      // If this fulfillment satisfies the entire allocation (everyone
      // accepted is now fulfilled and nothing is still in accepted), flip
      // the allocation to fulfilled.
      const outstanding = await tx.allocationRequest.count({
        where: {
          allocationId: a.id,
          status: AllocationRequestStatus.accepted,
        },
      });
      if (outstanding === 0 && a.status !== AllocationStatus.cancelled) {
        await tx.allocation.update({
          where: { id: a.id },
          data: {
            status: AllocationStatus.fulfilled,
            closedAt: a.closedAt ?? new Date(),
          },
        });
      }

      createdCount = wineRows.length;
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("fulfillRequest failed", e, { action: "fulfillRequest" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not fulfill.",
      message: null,
    };
  }

  revalidatePathsForRequest(requestId);
  revalidatePath("/collection");
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: `Fulfilled · ${createdCount} ${createdCount === 1 ? "wine" : "wines"} added to member collection.`,
  };
}

function revalidatePathsForRequest(requestId: string) {
  // We don't have the allocationId in scope without another query. Instead
  // of a DB round-trip, revalidate the admin list + the member's feed and
  // let the next read pick up the detail page too.
  revalidatePath("/admin/allocations");
  revalidatePath("/allocations");
  // No-op if the request id doesn't correspond to a page — Next.js tolerates it.
  void requestId;
}

class InvalidStateError extends Error {}
