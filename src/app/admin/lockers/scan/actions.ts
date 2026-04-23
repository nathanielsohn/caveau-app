"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  checkInWine,
  checkOutWine,
  getCheckInTargets,
  lookupWineByBarcode,
  type CheckInLockerOption,
  type WineScanMatch,
} from "@/lib/locker-scan";
import {
  LockerCheckInBodySchema,
  LockerCheckOutBodySchema,
  LockerScanLookupBodySchema,
  UuidSchema,
} from "@/lib/schemas";

export type { CheckInLockerOption, WineScanMatch } from "@/lib/locker-scan";

function forbidden() {
  return { ok: false as const, error: "Forbidden" };
}

function zodError(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues?: { message?: string }[] }).issues;
    const msg = issues?.[0]?.message;
    if (msg) return msg;
  }
  return "Invalid input";
}

export async function lookupWineByBarcodeAction(input: unknown): Promise<
  | { ok: true; wines: WineScanMatch[] }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") return forbidden();

  const parsed = LockerScanLookupBodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const { barcode, facilityId } = parsed.data;

  const matches = await lookupWineByBarcode({ barcode, facilityId });

  return { ok: true, wines: matches };
}

export async function getCheckInTargetsAction(input: unknown): Promise<
  | {
      ok: true;
      memberName: string;
      lockers: CheckInLockerOption[];
      suggested: { lockerId: string; slotPosition: number } | null;
    }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") return forbidden();

  const parsed = UuidSchema.safeParse(
    typeof input === "object" && input !== null && "wineId" in input
      ? (input as { wineId?: unknown }).wineId
      : undefined,
  );
  const parsedFacility = UuidSchema.safeParse(
    typeof input === "object" && input !== null && "facilityId" in input
      ? (input as { facilityId?: unknown }).facilityId
      : undefined,
  );
  if (!parsed.success || !parsedFacility.success) {
    return { ok: false, error: "Invalid input" };
  }

  const result = await getCheckInTargets({
    wineId: parsed.data,
    facilityId: parsedFacility.data,
  });
  if (!result) return { ok: false, error: "Wine not found" };

  return { ok: true, ...result };
}

export async function checkInWineAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  const actorId = session?.user?.id;
  if (session?.user?.role !== "admin" || !actorId) return forbidden();

  const parsed = LockerCheckInBodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const { facilityId, wineId, lockerId, slotPosition, notes } = parsed.data;

  const result = await checkInWine({
    actorMemberId: actorId,
    facilityId,
    wineId,
    lockerId,
    slotPosition,
    ...(notes ? { notes } : {}),
  });
  if (!result.ok) return result;

  revalidatePath("/admin/lockers/scan");
  revalidatePath("/admin/lockers");
  revalidatePath("/locker");
  revalidatePath("/collection");
  revalidatePath("/");
  return { ok: true };
}

export async function checkOutWineAction(input: unknown): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  const actorId = session?.user?.id;
  if (session?.user?.role !== "admin" || !actorId) return forbidden();

  const parsed = LockerCheckOutBodySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: zodError(parsed.error) };
  const { facilityId, wineId, lockerId, slotPosition, notes } = parsed.data;

  const result = await checkOutWine({
    actorMemberId: actorId,
    facilityId,
    wineId,
    lockerId,
    slotPosition,
    ...(notes ? { notes } : {}),
  });
  if (!result.ok) return result;

  revalidatePath("/admin/lockers/scan");
  revalidatePath("/admin/lockers");
  revalidatePath("/locker");
  revalidatePath("/collection");
  revalidatePath("/");
  return { ok: true };
}

export type LockerActivityRow = {
  id: string;
  action: string;
  occurredAt: string;
  actorName: string;
  slotPosition: number;
  locker: { id: string; lockerNumber: number; zone: string; facilityName: string };
  wine?: { id: string; name: string; vintage: number; producer: string; memberName: string };
  notes: string | null;
};

export async function getWineActivityAction(input: unknown): Promise<
  | { ok: true; activities: LockerActivityRow[] }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") return forbidden();

  const wineId = typeof input === "object" && input !== null && "wineId" in input
    ? (input as { wineId?: unknown }).wineId
    : undefined;
  const parsedWineId = UuidSchema.safeParse(wineId);
  if (!parsedWineId.success) return { ok: false, error: "Invalid wine ID" };

  const rows = await prisma.lockerActivity.findMany({
    where: { wineId: parsedWineId.data },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      occurredAt: true,
      slotPosition: true,
      notes: true,
      actorMember: { select: { name: true } },
      locker: {
        select: {
          id: true,
          lockerNumber: true,
          zone: true,
          facility: { select: { name: true } },
        },
      },
    },
  });

  return {
    ok: true,
    activities: rows.map((r) => ({
      id: r.id,
      action: r.action,
      occurredAt: r.occurredAt.toISOString(),
      actorName: r.actorMember.name,
      slotPosition: r.slotPosition,
      locker: {
        id: r.locker.id,
        lockerNumber: r.locker.lockerNumber,
        zone: r.locker.zone,
        facilityName: r.locker.facility.name,
      },
      notes: r.notes ?? null,
    })),
  };
}

export async function getLockerActivityAction(input: unknown): Promise<
  | { ok: true; activities: LockerActivityRow[] }
  | { ok: false; error: string }
> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") return forbidden();

  const lockerId = typeof input === "object" && input !== null && "lockerId" in input
    ? (input as { lockerId?: unknown }).lockerId
    : undefined;
  const parsedLockerId = UuidSchema.safeParse(lockerId);
  if (!parsedLockerId.success) return { ok: false, error: "Invalid locker ID" };

  const rows = await prisma.lockerActivity.findMany({
    where: { lockerId: parsedLockerId.data },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      occurredAt: true,
      slotPosition: true,
      notes: true,
      actorMember: { select: { name: true } },
      locker: {
        select: {
          id: true,
          lockerNumber: true,
          zone: true,
          facility: { select: { name: true } },
        },
      },
      wine: {
        select: {
          id: true,
          name: true,
          vintage: true,
          producer: true,
          member: { select: { name: true } },
        },
      },
    },
  });

  return {
    ok: true,
    activities: rows.map((r) => ({
      id: r.id,
      action: r.action,
      occurredAt: r.occurredAt.toISOString(),
      actorName: r.actorMember.name,
      slotPosition: r.slotPosition,
      locker: {
        id: r.locker.id,
        lockerNumber: r.locker.lockerNumber,
        zone: r.locker.zone,
        facilityName: r.locker.facility.name,
      },
      wine: {
        id: r.wine.id,
        name: r.wine.name,
        vintage: r.wine.vintage,
        producer: r.wine.producer,
        memberName: r.wine.member.name,
      },
      notes: r.notes ?? null,
    })),
  };
}
