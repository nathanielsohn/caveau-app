import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import type { FacilityType } from "@prisma/client";

export interface FacilityAnalyticsKpis {
  facility: {
    id: string;
    name: string;
    location: string;
    type: FacilityType;
    homeCellarCertifiedAt: Date | null;
  };
  membersCount: number;
  lockers: {
    assigned: number;
    total: number;
  };
  slots: {
    occupied: number;
    total: number;
  };
  alerts: {
    open: number;
    criticalOpen: number;
  };
  valueUnderCustodyUsd: number;
}

/**
 * Facility-level analytics (feature #32).
 *
 * Used by `/admin/facilities` list and `/admin/facilities/[id]` detail.
 * All metrics are read-only demo KPIs scoped to a facility:
 * - members enrolled at the facility (FacilityMember rows)
 * - lockers assigned vs. total
 * - slot occupancy (occupied slots vs. total slots)
 * - open / critical open Sentinel alerts (source=device, resolved=false)
 * - total value under custody: sum of currentValue for in-cellar wines
 *   currently stored in lockers at the facility
 */

export async function listFacilityAnalyticsKpis(): Promise<
  FacilityAnalyticsKpis[]
> {
  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      type: true,
      homeCellarCertifiedAt: true,
    },
  });
  if (facilities.length === 0) return [];

  const facilityIds = facilities.map((f) => f.id);

  const [memberCounts, lockers, openAlerts, valueRows] = await Promise.all([
    prisma.facilityMember.groupBy({
      by: ["facilityId"],
      where: { facilityId: { in: facilityIds } },
      _count: { memberId: true },
    }),
    prisma.locker.findMany({
      where: { facilityId: { in: facilityIds } },
      select: { id: true, facilityId: true, memberId: true },
    }),
    prisma.alert.findMany({
      where: {
        resolved: false,
        source: "device",
        locker: { facilityId: { in: facilityIds } },
      },
      select: {
        severity: true,
        locker: { select: { facilityId: true } },
      },
    }),
    prisma.lockerSlot.findMany({
      where: {
        wineId: { not: null },
        wine: { status: "in_cellar" },
        locker: { facilityId: { in: facilityIds } },
      },
      select: {
        locker: { select: { facilityId: true } },
        wine: { select: { currentValue: true } },
      },
    }),
  ]);

  const lockerIds = lockers.map((l) => l.id);
  const [slotCounts, occupiedSlotCounts] =
    lockerIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.lockerSlot.groupBy({
            by: ["lockerId"],
            where: { lockerId: { in: lockerIds } },
            _count: { _all: true },
          }),
          prisma.lockerSlot.groupBy({
            by: ["lockerId"],
            where: { lockerId: { in: lockerIds }, wineId: { not: null } },
            _count: { _all: true },
          }),
        ]);

  const membersByFacility = new Map<string, number>();
  for (const row of memberCounts) {
    membersByFacility.set(row.facilityId, row._count.memberId);
  }

  const lockersByFacility = new Map<string, { total: number; assigned: number }>();
  for (const locker of lockers) {
    const current = lockersByFacility.get(locker.facilityId) ?? {
      total: 0,
      assigned: 0,
    };
    current.total += 1;
    if (locker.memberId) current.assigned += 1;
    lockersByFacility.set(locker.facilityId, current);
  }

  const slotTotalByLocker = new Map<string, number>();
  for (const row of slotCounts) {
    slotTotalByLocker.set(row.lockerId, row._count._all);
  }

  const slotOccupiedByLocker = new Map<string, number>();
  for (const row of occupiedSlotCounts) {
    slotOccupiedByLocker.set(row.lockerId, row._count._all);
  }

  const slotsByFacility = new Map<string, { total: number; occupied: number }>();
  for (const locker of lockers) {
    const facilityId = locker.facilityId;
    const current = slotsByFacility.get(facilityId) ?? { total: 0, occupied: 0 };
    current.total += slotTotalByLocker.get(locker.id) ?? 0;
    current.occupied += slotOccupiedByLocker.get(locker.id) ?? 0;
    slotsByFacility.set(facilityId, current);
  }

  const alertsByFacility = new Map<string, { open: number; criticalOpen: number }>();
  for (const alert of openAlerts) {
    const facilityId = alert.locker.facilityId;
    const current = alertsByFacility.get(facilityId) ?? { open: 0, criticalOpen: 0 };
    current.open += 1;
    if (alert.severity === "critical") current.criticalOpen += 1;
    alertsByFacility.set(facilityId, current);
  }

  const valueByFacility = new Map<string, number>();
  for (const row of valueRows) {
    if (!row.wine) continue;
    const facilityId = row.locker.facilityId;
    const current = valueByFacility.get(facilityId) ?? 0;
    valueByFacility.set(facilityId, current + toNumber(row.wine.currentValue));
  }

  return facilities.map((f) => {
    const lockerCounts = lockersByFacility.get(f.id) ?? { total: 0, assigned: 0 };
    const slotCountsForFacility = slotsByFacility.get(f.id) ?? {
      total: 0,
      occupied: 0,
    };
    const alertCounts = alertsByFacility.get(f.id) ?? { open: 0, criticalOpen: 0 };
    return {
      facility: f,
      membersCount: membersByFacility.get(f.id) ?? 0,
      lockers: lockerCounts,
      slots: slotCountsForFacility,
      alerts: alertCounts,
      valueUnderCustodyUsd: valueByFacility.get(f.id) ?? 0,
    };
  });
}

export async function getFacilityAnalyticsKpis(
  facilityId: string
): Promise<FacilityAnalyticsKpis | null> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      id: true,
      name: true,
      location: true,
      type: true,
      homeCellarCertifiedAt: true,
    },
  });
  if (!facility) return null;

  const [
    membersCount,
    lockerTotal,
    lockersAssigned,
    slotTotal,
    slotOccupied,
    openAlertCount,
    criticalOpenAlertCount,
    valueAgg,
  ] = await Promise.all([
    prisma.facilityMember.count({ where: { facilityId } }),
    prisma.locker.count({ where: { facilityId } }),
    prisma.locker.count({ where: { facilityId, memberId: { not: null } } }),
    prisma.lockerSlot.count({ where: { locker: { facilityId } } }),
    prisma.lockerSlot.count({
      where: { locker: { facilityId }, wineId: { not: null } },
    }),
    prisma.alert.count({
      where: {
        resolved: false,
        source: "device",
        locker: { facilityId },
      },
    }),
    prisma.alert.count({
      where: {
        resolved: false,
        source: "device",
        severity: "critical",
        locker: { facilityId },
      },
    }),
    prisma.wine.aggregate({
      where: {
        status: "in_cellar",
        lockerSlots: { some: { locker: { facilityId } } },
      },
      _sum: { currentValue: true },
    }),
  ]);

  return {
    facility,
    membersCount,
    lockers: { total: lockerTotal, assigned: lockersAssigned },
    slots: { total: slotTotal, occupied: slotOccupied },
    alerts: { open: openAlertCount, criticalOpen: criticalOpenAlertCount },
    valueUnderCustodyUsd: toNumber(valueAgg._sum.currentValue),
  };
}
