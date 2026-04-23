import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type WineScanMatch = {
  id: string;
  name: string;
  vintage: number;
  producer: string;
  member: { id: string; name: string };
  status: string;
  currentSlot: null | {
    facilityId: string;
    facilityName: string;
    lockerId: string;
    lockerNumber: number;
    zone: string;
    slotPosition: number;
    dateStored: string | null;
  };
};

function mutationError(err: unknown): string {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    return "That bottle is already stored in a slot";
  }
  if (err instanceof Error) {
    if (err.message === "wine_not_found") return "Wine not found";
    if (err.message === "slot_not_found") return "Slot not found or unavailable";
    if (err.message === "locker_not_found") return "Locker not found";
  }
  return "Unable to complete the action";
}

export async function lookupWineByBarcode(input: {
  barcode: string;
  facilityId: string;
}): Promise<WineScanMatch[]> {
  const wines = await prisma.wine.findMany({
    where: { barcode: input.barcode },
    select: {
      id: true,
      name: true,
      vintage: true,
      producer: true,
      status: true,
      member: { select: { id: true, name: true } },
      lockerSlots: {
        take: 1,
        select: {
          slotPosition: true,
          dateStored: true,
          locker: {
            select: {
              id: true,
              lockerNumber: true,
              zone: true,
              facility: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ member: { name: "asc" } }, { createdAt: "desc" }],
  });

  const matches = wines.map((w) => {
    const slot = w.lockerSlots[0];
    return {
      id: w.id,
      name: w.name,
      vintage: w.vintage,
      producer: w.producer,
      status: w.status,
      member: w.member,
      currentSlot: slot
        ? {
            facilityId: slot.locker.facility.id,
            facilityName: slot.locker.facility.name,
            lockerId: slot.locker.id,
            lockerNumber: slot.locker.lockerNumber,
            zone: slot.locker.zone,
            slotPosition: slot.slotPosition,
            dateStored: slot.dateStored ? slot.dateStored.toISOString() : null,
          }
        : null,
    } satisfies WineScanMatch;
  });

  matches.sort((a, b) => {
    const aIn = a.currentSlot?.facilityId === input.facilityId;
    const bIn = b.currentSlot?.facilityId === input.facilityId;
    if (aIn !== bIn) return aIn ? -1 : 1;
    return a.member.name.localeCompare(b.member.name);
  });

  return matches;
}

export type CheckInLockerOption = {
  id: string;
  lockerNumber: number;
  zone: string;
  emptySlots: number[];
};

export async function getCheckInTargets(input: {
  wineId: string;
  facilityId: string;
}): Promise<{
  memberName: string;
  lockers: CheckInLockerOption[];
  suggested: { lockerId: string; slotPosition: number } | null;
} | null> {
  const wine = await prisma.wine.findUnique({
    where: { id: input.wineId },
    select: {
      id: true,
      memberId: true,
      member: { select: { name: true } },
    },
  });
  if (!wine) return null;

  const lockers = await prisma.locker.findMany({
    where: { facilityId: input.facilityId, memberId: wine.memberId },
    orderBy: { lockerNumber: "asc" },
    select: {
      id: true,
      lockerNumber: true,
      zone: true,
      slots: {
        where: { wineId: null },
        orderBy: { slotPosition: "asc" },
        select: { slotPosition: true },
      },
    },
  });

  const options: CheckInLockerOption[] = lockers.map((l) => ({
    id: l.id,
    lockerNumber: l.lockerNumber,
    zone: l.zone,
    emptySlots: l.slots.map((s) => s.slotPosition),
  }));

  const first = options.find((o) => o.emptySlots.length > 0) ?? null;
  let suggested: { lockerId: string; slotPosition: number } | null = null;
  if (first) {
    const slot = first.emptySlots[0];
    if (typeof slot === "number") {
      suggested = { lockerId: first.id, slotPosition: slot };
    }
  }

  return { memberName: wine.member.name, lockers: options, suggested };
}

export async function checkInWine(input: {
  actorMemberId: string;
  facilityId: string;
  wineId: string;
  lockerId: string;
  slotPosition: number;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const wine = await tx.wine.findUnique({
        where: { id: input.wineId },
        select: { id: true, memberId: true },
      });
      if (!wine) throw new Error("wine_not_found");

      const locker = await tx.locker.findFirst({
        where: { id: input.lockerId, facilityId: input.facilityId },
        select: { id: true },
      });
      if (!locker) throw new Error("locker_not_found");

      const slot = await tx.lockerSlot.findFirst({
        where: {
          lockerId: input.lockerId,
          slotPosition: input.slotPosition,
          wineId: null,
        },
        select: { id: true },
      });
      if (!slot) throw new Error("slot_not_found");

      await tx.lockerSlot.update({
        where: { id: slot.id },
        data: { wineId: wine.id, dateStored: new Date() },
      });

      await tx.lockerActivity.create({
        data: {
          action: "check_in",
          lockerId: input.lockerId,
          slotPosition: input.slotPosition,
          wineId: wine.id,
          actorMemberId: input.actorMemberId,
          occurredAt: new Date(),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mutationError(err) };
  }
}

export async function checkOutWine(input: {
  actorMemberId: string;
  facilityId: string;
  wineId: string;
  lockerId: string;
  slotPosition: number;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await prisma.$transaction(async (tx) => {
      const wine = await tx.wine.findUnique({
        where: { id: input.wineId },
        select: { id: true, memberId: true },
      });
      if (!wine) throw new Error("wine_not_found");

      const locker = await tx.locker.findFirst({
        where: {
          id: input.lockerId,
          facilityId: input.facilityId,
          memberId: wine.memberId,
        },
        select: { id: true },
      });
      if (!locker) throw new Error("locker_not_found");

      const slot = await tx.lockerSlot.findFirst({
        where: {
          lockerId: input.lockerId,
          slotPosition: input.slotPosition,
          wineId: wine.id,
        },
        select: { id: true },
      });
      if (!slot) throw new Error("slot_not_found");

      await tx.lockerSlot.update({
        where: { id: slot.id },
        data: { wineId: null, dateStored: null },
      });

      await tx.lockerActivity.create({
        data: {
          action: "check_out",
          lockerId: input.lockerId,
          slotPosition: input.slotPosition,
          wineId: wine.id,
          actorMemberId: input.actorMemberId,
          occurredAt: new Date(),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      });
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: mutationError(err) };
  }
}

