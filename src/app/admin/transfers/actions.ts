"use server";

import { revalidatePath } from "next/cache";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { UuidSchema } from "@/lib/schemas";
import {
  crossFacilityTransfer,
  CrossFacilityTransferError,
  type CrossFacilityTransferResult,
} from "@/lib/cross-facility-transfer";

export interface TransferWineSearchResult {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  barcode: string | null;
  member: { id: string; name: string };
  location: {
    facilityId: string;
    facilityName: string;
    lockerId: string;
    lockerNumber: number;
    slotId: string;
    slotPosition: number;
  } | null;
}

export interface DestinationLockerOption {
  id: string;
  lockerNumber: number;
  zone: string;
  totalSlots: number;
  emptySlots: number;
}

export interface LockerSlotOption {
  id: string;
  slotPosition: number;
  wineId: string | null;
  wineLabel: string | null;
}

export type TransferActionResult =
  | { ok: true; transfer: CrossFacilityTransferResult }
  | { ok: false; error: string };

async function requireAdminId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

function buildWineSearchWhere(query: string): Prisma.WineWhereInput | null {
  const q = query.trim();
  if (q.length < 2) return null;

  const numeric = parseInt(q, 10);
  const hasVintage =
    Number.isFinite(numeric) && numeric >= 1800 && numeric <= 2100;

  const or: Prisma.WineWhereInput[] = [
    { barcode: { equals: q } },
    { barcode: { contains: q } },
    { name: { contains: q, mode: "insensitive" } },
    { producer: { contains: q, mode: "insensitive" } },
  ];
  if (hasVintage) or.push({ vintage: numeric });

  return {
    lockerSlots: { some: {} },
    OR: or,
  };
}

export async function searchWinesForTransferAction(
  query: string,
): Promise<
  { ok: true; wines: TransferWineSearchResult[] } | { ok: false; error: string }
> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const where = buildWineSearchWhere(query);
  if (!where) return { ok: true, wines: [] };

  const wines = await prisma.wine.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 25,
    select: {
      id: true,
      name: true,
      producer: true,
      vintage: true,
      barcode: true,
      member: { select: { id: true, name: true } },
      lockerSlots: {
        select: {
          id: true,
          slotPosition: true,
          locker: {
            select: {
              id: true,
              lockerNumber: true,
              facility: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  return {
    ok: true,
    wines: wines.map((w) => {
      const slot = w.lockerSlots[0] ?? null;
      return {
        id: w.id,
        name: w.name,
        producer: w.producer,
        vintage: w.vintage,
        barcode: w.barcode,
        member: w.member,
        location: slot
          ? {
              facilityId: slot.locker.facility.id,
              facilityName: slot.locker.facility.name,
              lockerId: slot.locker.id,
              lockerNumber: slot.locker.lockerNumber,
              slotId: slot.id,
              slotPosition: slot.slotPosition,
            }
          : null,
      };
    }),
  };
}

export async function getDestinationLockersAction(params: {
  facilityId: string;
  memberId: string;
}): Promise<
  { ok: true; lockers: DestinationLockerOption[] } | { ok: false; error: string }
> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const facilityCheck = UuidSchema.safeParse(params.facilityId);
  if (!facilityCheck.success) {
    return { ok: false, error: "Invalid facility id" };
  }

  const memberCheck = UuidSchema.safeParse(params.memberId);
  if (!memberCheck.success) return { ok: false, error: "Invalid member id" };

  const lockers = await prisma.locker.findMany({
    where: { facilityId: facilityCheck.data, memberId: memberCheck.data },
    orderBy: [{ lockerNumber: "asc" }],
    include: {
      _count: { select: { slots: true } },
      slots: { where: { wineId: null }, select: { id: true } },
    },
    take: 200,
  });

  return {
    ok: true,
    lockers: lockers.map((l) => ({
      id: l.id,
      lockerNumber: l.lockerNumber,
      zone: l.zone,
      totalSlots: l._count.slots,
      emptySlots: l.slots.length,
    })),
  };
}

export async function getLockerSlotsAction(params: {
  lockerId: string;
  memberId: string;
}): Promise<
  { ok: true; slots: LockerSlotOption[] } | { ok: false; error: string }
> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const lockerCheck = UuidSchema.safeParse(params.lockerId);
  if (!lockerCheck.success) return { ok: false, error: "Invalid locker id" };

  const memberCheck = UuidSchema.safeParse(params.memberId);
  if (!memberCheck.success) return { ok: false, error: "Invalid member id" };

  const locker = await prisma.locker.findFirst({
    where: { id: lockerCheck.data, memberId: memberCheck.data },
    select: { id: true },
  });
  if (!locker) return { ok: false, error: "Locker not found for this member" };

  const slots = await prisma.lockerSlot.findMany({
    where: { lockerId: locker.id },
    orderBy: { slotPosition: "asc" },
    select: {
      id: true,
      slotPosition: true,
      wineId: true,
      wine: { select: { producer: true, name: true, vintage: true } },
    },
  });

  return {
    ok: true,
    slots: slots.map((s) => ({
      id: s.id,
      slotPosition: s.slotPosition,
      wineId: s.wineId,
      wineLabel: s.wine
        ? `${s.wine.producer} · ${s.wine.name} (${s.wine.vintage})`
        : null,
    })),
  };
}

export async function performCrossFacilityTransferAction(
  wineId: string,
  destinationSlotId: string,
): Promise<TransferActionResult> {
  const adminId = await requireAdminId();
  if (!adminId) return { ok: false, error: "Forbidden" };

  const wineCheck = UuidSchema.safeParse(wineId);
  if (!wineCheck.success) return { ok: false, error: "Invalid wine id" };

  const destinationCheck = UuidSchema.safeParse(destinationSlotId);
  if (!destinationCheck.success) {
    return { ok: false, error: "Invalid destination slot id" };
  }

  let transfer: CrossFacilityTransferResult;
  try {
    transfer = await crossFacilityTransfer({
      wineId: wineCheck.data,
      destinationSlotId: destinationCheck.data,
      actorMemberId: adminId,
    });
  } catch (e) {
    if (e instanceof CrossFacilityTransferError) {
      return { ok: false, error: e.message };
    }
    logger.error("performCrossFacilityTransferAction failed", e, {
      action: "performCrossFacilityTransferAction",
    });
    return { ok: false, error: "Could not transfer. Please try again." };
  }

  revalidatePath("/admin/lockers");
  revalidatePath("/admin/transfers");
  revalidatePath("/locker");
  revalidatePath("/collection");
  revalidatePath("/");
  revalidatePath(`/wine/${transfer.wine.id}`);

  return { ok: true, transfer };
}

