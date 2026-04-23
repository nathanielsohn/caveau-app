"use server";

import { revalidatePath } from "next/cache";
import {
  DispositionType,
  ExitChannel,
  ExitStatus,
  Role,
  WineStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  ListExitFacilitationSchema,
  SellExitFacilitationSchema,
  WithdrawExitFacilitationSchema,
  UuidSchema,
} from "@/lib/schemas";
import {
  canTransitionExit,
  CHANNEL_LABELS,
  computeCommission,
} from "@/lib/exits";

export interface AdminExitFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const INITIAL_ADMIN_EXIT_STATE: AdminExitFormState = {
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

// ── List on a channel ──────────────────────────────────────────────────

export async function listExit(
  _prev: AdminExitFormState,
  formData: FormData,
): Promise<AdminExitFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = ListExitFacilitationSchema.safeParse({
    exitId: formData.get("exitId"),
    channel: formData.get("channel"),
    auctionHouseName: formData.get("auctionHouseName"),
    listedPriceUsd: formData.get("listedPriceUsd"),
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
  const { exitId, channel, auctionHouseName, listedPriceUsd, staffNote } =
    parsed.data;

  try {
    // Single atomic transition — the status filter in the WHERE clause
    // makes this race-safe against a second admin clicking "list" at the
    // same moment. A `findUnique` + `update` split would let both reads
    // pass the canTransition check and both writes succeed.
    const { count } = await prisma.exitFacilitation.updateMany({
      where: { id: exitId, status: ExitStatus.requested },
      data: {
        status: ExitStatus.listed,
        channel,
        auctionHouseName:
          channel === ExitChannel.auction
            ? (auctionHouseName?.trim() || null)
            : null,
        listedPriceUsd,
        staffNote: staffNote ?? null,
        listedAt: new Date(),
      },
    });
    if (count === 0) {
      const exists = await prisma.exitFacilitation.findUnique({
        where: { id: exitId },
        select: { id: true },
      });
      throw new InvalidStateError(
        exists
          ? "Only a new request can move to listed."
          : "Exit not found",
      );
    }
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("listExit failed", e, { action: "listExit" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not list the exit.",
      message: null,
    };
  }

  revalidateExitPaths(exitId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: `Listed · ${CHANNEL_LABELS[channel]}`,
  };
}

// ── Close the sale ─────────────────────────────────────────────────────
//
// The transactional core of #47. When an exit flips to `sold`:
//   1. Write a WineDisposition row (type=sold, salePrice=grossProceeds,
//      recipient=channel label / auction house). This is the existing
//      #34 audit trail for wines leaving the collection — reusing it
//      means the member's disposition history on the wine page stays
//      the single source of truth for "this bottle was sold".
//   2. Flip Wine.status to `sold` so collection filters + CAGR math
//      skip the bottle. The dispositions FK is RESTRICT so the bottle
//      stays queryable forever.
//   3. Close any open ExitSignal on the wine with reason
//      `exit_facilitated` so the dashboard teaser drops it immediately
//      (the scoring pass would catch it next run via the wine.status
//      check, but coupling in-transaction keeps UI consistent).
//   4. Stamp the facilitation row with gross, commission_pct,
//      commission_usd, net, sold_at, sold_by_id.
//
// All four writes in one $transaction so a mid-flight failure can't
// leave the collection view in a partial state.

export async function sellExit(
  _prev: AdminExitFormState,
  formData: FormData,
): Promise<AdminExitFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = SellExitFacilitationSchema.safeParse({
    exitId: formData.get("exitId"),
    grossProceedsUsd: formData.get("grossProceedsUsd"),
    commissionPct: formData.get("commissionPct"),
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
  const { exitId, grossProceedsUsd, commissionPct, staffNote } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const exit = await tx.exitFacilitation.findUnique({
        where: { id: exitId },
      });
      if (!exit) throw new InvalidStateError("Exit not found");
      if (!canTransitionExit(exit.status, ExitStatus.sold)) {
        throw new InvalidStateError(
          "Only a listed exit can close as sold.",
        );
      }
      if (!exit.channel) {
        throw new InvalidStateError(
          "Exit has no channel set — list it before closing the sale.",
        );
      }

      const commission = computeCommission({
        grossProceedsUsd,
        commissionPct,
      });
      const saleDate = new Date();

      // 1. Disposition audit row. Recipient records the route so the
      //    disposition history on /wine/[id] reads cleanly alongside
      //    the existing sold-at-Sotheby's entries (#34 + Rob's seed).
      const recipient =
        exit.channel === ExitChannel.auction && exit.auctionHouseName
          ? exit.auctionHouseName
          : CHANNEL_LABELS[exit.channel];

      await tx.wineDisposition.create({
        data: {
          wineId: exit.wineId,
          memberId: exit.memberId,
          type: DispositionType.sold,
          date: saleDate,
          salePrice: grossProceedsUsd,
          recipient,
          notes: `Consigned via Caveau exit facilitation #${exit.id.slice(0, 8)}.`,
        },
      });

      // 2. Flip the Wine to sold so it drops from in-cellar views.
      await tx.wine.update({
        where: { id: exit.wineId },
        data: { status: WineStatus.sold },
      });

      // 3. Close any open exit signal for the wine. `updateMany` because
      //    there should be at most one (partial unique index in migration
      //    0034) but we don't want a FK-miss to abort the whole sale if
      //    the signal already closed.
      await tx.exitSignal.updateMany({
        where: { wineId: exit.wineId, closedAt: null },
        data: {
          closedAt: saleDate,
          closedReason: "exit_facilitated",
        },
      });

      // 4. Stamp the facilitation itself. Use `updateMany` with a status
      //    filter so two concurrent close-sale clicks can't both slip
      //    through — the second transaction's count will be 0 and the
      //    whole txn (disposition + wine flip) rolls back.
      const stamped = await tx.exitFacilitation.updateMany({
        where: { id: exitId, status: ExitStatus.listed },
        data: {
          status: ExitStatus.sold,
          grossProceedsUsd,
          commissionPct,
          commissionUsd: commission.commissionUsd,
          netProceedsUsd: commission.netProceedsUsd,
          soldAt: saleDate,
          soldById: adminId,
          staffNote: staffNote ?? exit.staffNote ?? null,
        },
      });
      if (stamped.count === 0) {
        throw new InvalidStateError(
          "Another admin just closed this sale — refresh the page.",
        );
      }
    });
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("sellExit failed", e, { action: "sellExit" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not close the sale.",
      message: null,
    };
  }

  revalidateExitPaths(exitId);
  revalidatePath("/collection");
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message:
      "Sale closed — disposition recorded, wine marked sold, exit signal closed.",
  };
}

// ── Withdraw ───────────────────────────────────────────────────────────

export async function withdrawExit(
  _prev: AdminExitFormState,
  formData: FormData,
): Promise<AdminExitFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = WithdrawExitFacilitationSchema.safeParse({
    exitId: formData.get("exitId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }
  const { exitId, reason } = parsed.data;

  try {
    // Withdrawal is legal from `requested` or `listed` — include both in
    // the atomic WHERE so the status filter mirrors `canTransitionExit`.
    const { count } = await prisma.exitFacilitation.updateMany({
      where: {
        id: exitId,
        status: { in: [ExitStatus.requested, ExitStatus.listed] },
      },
      data: {
        status: ExitStatus.withdrawn,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
      },
    });
    if (count === 0) {
      const exists = await prisma.exitFacilitation.findUnique({
        where: { id: exitId },
        select: { id: true },
      });
      throw new InvalidStateError(
        exists ? "This exit can no longer be withdrawn." : "Exit not found",
      );
    }
  } catch (e) {
    if (e instanceof InvalidStateError) {
      return { submittedAt: now, ok: false, error: e.message, message: null };
    }
    logger.error("withdrawExit failed", e, { action: "withdrawExit" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not withdraw.",
      message: null,
    };
  }

  revalidateExitPaths(exitId);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Withdrawn — member notified via the detail page.",
  };
}

// ── Save staff note without status change ──────────────────────────────

export async function updateExitNote(
  _prev: AdminExitFormState,
  formData: FormData,
): Promise<AdminExitFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const idCheck = UuidSchema.safeParse(formData.get("exitId"));
  if (!idCheck.success) {
    return {
      submittedAt: now,
      ok: false,
      error: "Invalid exit id.",
      message: null,
    };
  }
  const rawNote = formData.get("staffNote");
  const staffNote =
    typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, 1000)
      : null;

  try {
    await prisma.exitFacilitation.update({
      where: { id: idCheck.data },
      data: { staffNote },
    });
  } catch (e) {
    logger.error("updateExitNote failed", e, { action: "updateExitNote" });
    return {
      submittedAt: now,
      ok: false,
      error: "Could not save note.",
      message: null,
    };
  }

  revalidateExitPaths(idCheck.data);
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Note saved.",
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function revalidateExitPaths(exitId: string) {
  revalidatePath("/admin/exits");
  revalidatePath(`/admin/exits/${exitId}`);
  revalidatePath("/exits");
  revalidatePath(`/exits/${exitId}`);
}
