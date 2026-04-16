"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role, type HurricaneStage, Severity, FacilityEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { STAGE_ORDER } from "@/lib/hurricane";

async function requireStaff() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin && session.user.role !== Role.staff) {
    redirect("/");
  }
  return session;
}

export async function activateProtocol(formData: FormData): Promise<void> {
  await requireStaff();

  const facilityId = String(formData.get("facilityId") ?? "");
  const stormName = String(formData.get("stormName") ?? "").trim();
  const nhcAdvisory = String(formData.get("nhcAdvisory") ?? "").trim() || null;
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!facilityId || stormName.length === 0) {
    throw new Error("Facility and storm name are required");
  }
  const category =
    categoryRaw.length > 0 && Number.isFinite(Number(categoryRaw))
      ? Math.max(1, Math.min(5, Number(categoryRaw)))
      : null;

  // Snapshot every enrolled member at this facility — so the protocol
  // "locks in" the enrollment state at activation time. A member
  // disenrolling after activation keeps their row (and the staff console
  // still shows them) rather than silently dropping from the roster.
  const enrolled = await prisma.facilityMember.findMany({
    where: {
      facilityId,
      member: { hurricaneProtectionActive: true },
    },
    select: { memberId: true },
  });

  const protocol = await prisma.hurricaneProtocol.create({
    data: {
      facilityId,
      stormName,
      nhcAdvisory,
      category,
      watchIssuedAt: new Date(),
      notes,
      members: {
        create: enrolled.map((e) => ({ memberId: e.memberId })),
      },
    },
  });

  logger.info("Hurricane protocol activated", {
    action: "activateProtocol",
    protocolId: protocol.id,
    facilityId,
    stormName,
    enrolledCount: enrolled.length,
  });

  revalidatePath("/admin/hurricane");
  revalidatePath("/");
  redirect(`/admin/hurricane/${protocol.id}`);
}

export async function advanceStage(formData: FormData): Promise<void> {
  await requireStaff();

  const protocolId = String(formData.get("protocolId") ?? "");
  const targetStage = String(formData.get("stage") ?? "") as HurricaneStage;
  if (!STAGE_ORDER.includes(targetStage) && targetStage !== "cancelled") {
    throw new Error("Invalid stage");
  }

  const now = new Date();
  const stageTimestamps: Partial<Record<HurricaneStage, { field: string }>> = {
    watch_issued: { field: "watchIssuedAt" },
    transport_dispatched: { field: "transportDispatchedAt" },
    sheltered: { field: "shelteredAt" },
    all_clear: { field: "allClearAt" },
    returned: { field: "returnedAt" },
    cancelled: { field: "cancelledAt" },
  };
  const fieldEntry = stageTimestamps[targetStage];

  // Wrap the find + (conditional) event create + stage update in a single
  // transaction so two staff racing "Advance to All-Clear" can't both
  // insert a FacilityEvent and orphan one in the audit trail. The
  // updateMany with a facilityEventId=null predicate is the atomic claim —
  // whichever racer gets there second finds count===0 and we rollback the
  // duplicate FacilityEvent we just created.
  await prisma.$transaction(async (tx) => {
    const protocol = await tx.hurricaneProtocol.findUnique({
      where: { id: protocolId },
      select: {
        id: true,
        facilityId: true,
        stormName: true,
        watchIssuedAt: true,
        facilityEventId: true,
      },
    });
    if (!protocol) throw new Error("Protocol not found");

    if (targetStage === "all_clear" && !protocol.facilityEventId) {
      const facilityEvent = await tx.facilityEvent.create({
        data: {
          facilityId: protocol.facilityId,
          type: FacilityEventType.hurricane,
          severity: Severity.critical,
          startedAt: protocol.watchIssuedAt,
          endedAt: now,
          notes: `Hurricane ${protocol.stormName} — members enrolled in the Emergency Collection Protection protocol were sheltered inland for the duration of the event. Environmental envelope preserved via continuous cold-chain transport.`,
        },
      });

      const linked = await tx.hurricaneProtocol.updateMany({
        where: { id: protocolId, facilityEventId: null },
        data: {
          stage: targetStage,
          ...(fieldEntry ? { [fieldEntry.field]: now } : {}),
          facilityEventId: facilityEvent.id,
        },
      });
      if (linked.count === 0) {
        throw new Error("Protocol already advanced by another operator");
      }
    } else {
      await tx.hurricaneProtocol.update({
        where: { id: protocolId },
        data: {
          stage: targetStage,
          ...(fieldEntry ? { [fieldEntry.field]: now } : {}),
        },
      });
    }
  });

  revalidatePath("/admin/hurricane");
  revalidatePath(`/admin/hurricane/${protocolId}`);
  revalidatePath("/");
}

// Captures the per-member bottle/value snapshot at pickup. Staff enters
// this as part of the "transport dispatched → sheltered" hand-off. We
// compute sensible defaults server-side (current live portfolio) but let
// staff overwrite if the physical count diverges.
export async function snapshotMember(formData: FormData): Promise<void> {
  await requireStaff();

  const membershipId = String(formData.get("membershipId") ?? "");
  const bottleCountRaw = String(formData.get("bottleCount") ?? "").trim();
  const totalValueRaw = String(formData.get("totalValue") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const bottleCount =
    bottleCountRaw.length > 0 && Number.isFinite(Number(bottleCountRaw))
      ? Math.max(0, Math.floor(Number(bottleCountRaw)))
      : null;
  const totalValue =
    totalValueRaw.length > 0 && Number.isFinite(Number(totalValueRaw))
      ? Math.max(0, Number(totalValueRaw))
      : null;

  const membership = await prisma.hurricaneProtocolMember.findUnique({
    where: { id: membershipId },
    select: { protocolId: true },
  });
  if (!membership) throw new Error("Membership not found");

  await prisma.hurricaneProtocolMember.update({
    where: { id: membershipId },
    data: {
      bottleCountSnapshot: bottleCount,
      totalValueSnapshot: totalValue,
      notes,
    },
  });

  revalidatePath(`/admin/hurricane/${membership.protocolId}`);
}
