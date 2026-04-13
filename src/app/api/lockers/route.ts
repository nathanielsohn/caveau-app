import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireMemberFacility();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lockers = await prisma.locker.findMany({
    where: { memberId: ctx.memberId, facilityId: ctx.facilityId },
    orderBy: { lockerNumber: "asc" },
    include: {
      slots: {
        select: { id: true, wineId: true },
      },
    },
  });

  const serialized = lockers.map((locker) => ({
    id: locker.id,
    lockerNumber: locker.lockerNumber,
    zone: locker.zone,
    facilityId: locker.facilityId,
    memberId: locker.memberId,
    totalSlots: locker.slots.length,
    occupiedSlots: locker.slots.filter((s) => s.wineId != null).length,
  }));

  return NextResponse.json(serialized);
}
