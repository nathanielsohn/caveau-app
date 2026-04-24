import { LockerActivityAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CrossFacilityTransferLocation {
  facilityId: string;
  facilityName: string;
  lockerId: string;
  lockerNumber: number;
  slotId: string;
  slotPosition: number;
}

export interface CrossFacilityTransferResult {
  wine: {
    id: string;
    name: string;
    producer: string;
    vintage: number;
    memberId: string;
    memberName: string;
  };
  source: CrossFacilityTransferLocation;
  destination: CrossFacilityTransferLocation;
  occurredAt: string;
}

export class CrossFacilityTransferError extends Error {}

function formatLocation(loc: CrossFacilityTransferLocation) {
  return `${loc.facilityName} · Locker #${loc.lockerNumber} · Slot ${loc.slotPosition}`;
}

export async function crossFacilityTransfer(params: {
  wineId: string;
  destinationSlotId: string;
  actorMemberId: string;
  now?: Date;
}): Promise<CrossFacilityTransferResult> {
  const now = params.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const wine = await tx.wine.findUnique({
      where: { id: params.wineId },
      select: {
        id: true,
        name: true,
        producer: true,
        vintage: true,
        memberId: true,
        member: { select: { name: true } },
      },
    });
    if (!wine) throw new CrossFacilityTransferError("Wine not found.");

    const sourceSlot = await tx.lockerSlot.findUnique({
      where: { wineId: wine.id },
      select: {
        id: true,
        lockerId: true,
        slotPosition: true,
        wineId: true,
        locker: {
          select: {
            id: true,
            lockerNumber: true,
            memberId: true,
            facility: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!sourceSlot || sourceSlot.wineId !== wine.id) {
      throw new CrossFacilityTransferError(
        "This wine isn’t currently stored in a locker slot.",
      );
    }
    if (!sourceSlot.locker.memberId) {
      throw new CrossFacilityTransferError(
        "Source locker isn’t assigned to a member — transfer aborted.",
      );
    }
    if (sourceSlot.locker.memberId !== wine.memberId) {
      throw new CrossFacilityTransferError(
        "Wine membership doesn’t match its current locker assignment.",
      );
    }

    const destinationSlot = await tx.lockerSlot.findUnique({
      where: { id: params.destinationSlotId },
      select: {
        id: true,
        lockerId: true,
        slotPosition: true,
        wineId: true,
        locker: {
          select: {
            id: true,
            lockerNumber: true,
            memberId: true,
            facility: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!destinationSlot) {
      throw new CrossFacilityTransferError("Destination slot not found.");
    }
    if (destinationSlot.id === sourceSlot.id) {
      throw new CrossFacilityTransferError("Pick a different destination slot.");
    }
    if (destinationSlot.wineId) {
      throw new CrossFacilityTransferError(
        "Destination slot already contains a wine. Pick an empty slot.",
      );
    }
    if (!destinationSlot.locker.memberId) {
      throw new CrossFacilityTransferError(
        "Destination locker isn’t assigned to a member.",
      );
    }
    if (destinationSlot.locker.memberId !== wine.memberId) {
      throw new CrossFacilityTransferError(
        "Destination locker must belong to the same member as the wine.",
      );
    }

    const source: CrossFacilityTransferLocation = {
      facilityId: sourceSlot.locker.facility.id,
      facilityName: sourceSlot.locker.facility.name,
      lockerId: sourceSlot.locker.id,
      lockerNumber: sourceSlot.locker.lockerNumber,
      slotId: sourceSlot.id,
      slotPosition: sourceSlot.slotPosition,
    };
    const destination: CrossFacilityTransferLocation = {
      facilityId: destinationSlot.locker.facility.id,
      facilityName: destinationSlot.locker.facility.name,
      lockerId: destinationSlot.locker.id,
      lockerNumber: destinationSlot.locker.lockerNumber,
      slotId: destinationSlot.id,
      slotPosition: destinationSlot.slotPosition,
    };

    const notes = `Transfer: ${formatLocation(source)} → ${formatLocation(destination)}`;

    const { count: cleared } = await tx.lockerSlot.updateMany({
      where: { id: sourceSlot.id, wineId: wine.id },
      data: { wineId: null, dateStored: null },
    });
    if (cleared === 0) {
      throw new CrossFacilityTransferError(
        "Source slot changed while transferring — refresh and try again.",
      );
    }

    const { count: filled } = await tx.lockerSlot.updateMany({
      where: { id: destinationSlot.id, wineId: null },
      data: { wineId: wine.id, dateStored: now },
    });
    if (filled === 0) {
      throw new CrossFacilityTransferError(
        "Destination slot is no longer empty. Pick another slot.",
      );
    }

    await tx.lockerActivity.createMany({
      data: [
        {
          action: LockerActivityAction.check_out,
          lockerId: sourceSlot.lockerId,
          slotPosition: sourceSlot.slotPosition,
          wineId: wine.id,
          actorMemberId: params.actorMemberId,
          occurredAt: now,
          notes,
        },
        {
          action: LockerActivityAction.check_in,
          lockerId: destinationSlot.lockerId,
          slotPosition: destinationSlot.slotPosition,
          wineId: wine.id,
          actorMemberId: params.actorMemberId,
          occurredAt: now,
          notes,
        },
      ],
    });

    return {
      wine: {
        id: wine.id,
        name: wine.name,
        producer: wine.producer,
        vintage: wine.vintage,
        memberId: wine.memberId,
        memberName: wine.member.name,
      },
      source,
      destination,
      occurredAt: now.toISOString(),
    };
  });
}

