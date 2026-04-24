import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: { findMany: vi.fn(), findUnique: vi.fn() },
    facilityMember: { groupBy: vi.fn(), count: vi.fn() },
    locker: { findMany: vi.fn(), count: vi.fn() },
    lockerSlot: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
    alert: { findMany: vi.fn(), count: vi.fn() },
    wine: { aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  listFacilityAnalyticsKpis,
  getFacilityAnalyticsKpis,
} from "@/lib/facility-analytics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("facility analytics", () => {
  it("lists facility KPIs with aggregated counts and custody value", async () => {
    (prisma.facility.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "fac-2", name: "Caveau Miami", location: "Miami, FL" },
      { id: "fac-1", name: "Caveau Naples", location: "Naples, FL" },
    ]);

    (prisma.facilityMember.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue(
      [
        { facilityId: "fac-1", _count: { memberId: 3 } },
        { facilityId: "fac-2", _count: { memberId: 1 } },
      ],
    );

    (prisma.locker.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "locker-a", facilityId: "fac-1", memberId: "m-1" },
      { id: "locker-b", facilityId: "fac-1", memberId: null },
      { id: "locker-c", facilityId: "fac-2", memberId: "m-2" },
    ]);

    (prisma.alert.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { severity: "critical", locker: { facilityId: "fac-1" } },
      { severity: "warning", locker: { facilityId: "fac-1" } },
      { severity: "critical", locker: { facilityId: "fac-2" } },
    ]);

    (prisma.lockerSlot.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { locker: { facilityId: "fac-1" }, wine: { currentValue: "1000" } },
      { locker: { facilityId: "fac-2" }, wine: { currentValue: "2500.50" } },
    ]);

    (prisma.lockerSlot.groupBy as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { lockerId: "locker-a", _count: { _all: 32 } },
        { lockerId: "locker-b", _count: { _all: 32 } },
        { lockerId: "locker-c", _count: { _all: 32 } },
      ])
      .mockResolvedValueOnce([
        { lockerId: "locker-a", _count: { _all: 5 } },
        { lockerId: "locker-c", _count: { _all: 10 } },
      ]);

    const result = await listFacilityAnalyticsKpis();
    expect(result).toEqual([
      {
        facility: { id: "fac-2", name: "Caveau Miami", location: "Miami, FL" },
        membersCount: 1,
        lockers: { total: 1, assigned: 1 },
        slots: { total: 32, occupied: 10 },
        alerts: { open: 1, criticalOpen: 1 },
        valueUnderCustodyUsd: 2500.5,
      },
      {
        facility: { id: "fac-1", name: "Caveau Naples", location: "Naples, FL" },
        membersCount: 3,
        lockers: { total: 2, assigned: 1 },
        slots: { total: 64, occupied: 5 },
        alerts: { open: 2, criticalOpen: 1 },
        valueUnderCustodyUsd: 1000,
      },
    ]);
  });

  it("returns null for unknown facility id", async () => {
    (prisma.facility.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await getFacilityAnalyticsKpis("missing");
    expect(result).toBeNull();
  });

  it("loads facility KPIs for one facility", async () => {
    (prisma.facility.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "fac-1",
      name: "Caveau Naples",
      location: "Naples, FL",
    });

    (prisma.facilityMember.count as ReturnType<typeof vi.fn>).mockResolvedValue(7);
    (prisma.locker.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(9);
    (prisma.lockerSlot.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(384)
      .mockResolvedValueOnce(210);
    (prisma.alert.count as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);

    (prisma.wine.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { currentValue: "480000.25" },
    });

    const result = await getFacilityAnalyticsKpis("fac-1");
    expect(result).toEqual({
      facility: { id: "fac-1", name: "Caveau Naples", location: "Naples, FL" },
      membersCount: 7,
      lockers: { total: 12, assigned: 9 },
      slots: { total: 384, occupied: 210 },
      alerts: { open: 4, criticalOpen: 2 },
      valueUnderCustodyUsd: 480000.25,
    });
  });
});

