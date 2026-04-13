import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { getCurrentFacility } from "@/lib/current-facility";
import { Lock } from "lucide-react";
import { type SlotData, type UnassignedWine } from "@/components/locker-grid";
import LockerSelector from "./locker-selector";

export const dynamic = "force-dynamic";

async function getLockers(memberId: string, facilityId: string) {
  const lockers = await prisma.locker.findMany({
    where: { memberId, facilityId },
    orderBy: { lockerNumber: "asc" },
    take: 50,
    include: {
      slots: {
        orderBy: { slotPosition: "asc" },
        include: {
          wine: {
            select: {
              id: true,
              name: true,
              vintage: true,
              region: true,
              varietal: true,
              currentValue: true,
              drinkWindowStart: true,
              drinkWindowEnd: true,
            },
          },
        },
      },
    },
  });

  return lockers;
}

/** Fetch wines belonging to the member that are not assigned to any locker slot */
async function getUnassignedWines(memberId: string): Promise<UnassignedWine[]> {
  const wines = await prisma.wine.findMany({
    where: {
      memberId,
      status: "in_cellar",
      lockerSlots: { none: {} },
    },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
    },
  });

  return wines;
}

export default async function LockerPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const facility = await getCurrentFacility(session.user.id);
  const [lockers, unassignedWines] = await Promise.all([
    facility ? getLockers(session.user.id, facility.id) : [],
    getUnassignedWines(session.user.id),
  ]);

  if (lockers.length === 0) {
    return (
      <div className="p-6 md:p-10">
        <div className="glass-card p-10 text-center">
          <Lock size={40} className="text-muted mx-auto mb-4" />
          <h2 className="font-serif text-xl text-primary mb-2">
            No Locker Assigned
          </h2>
          <p className="text-secondary text-sm">
            {facility
              ? `You don't have a locker at ${facility.name} yet. Switch facilities or contact Caveau to reserve one.`
              : "Contact Caveau to reserve your private storage locker."}
          </p>
        </div>
      </div>
    );
  }

  // Serialize locker data for client components (Decimal → string, Date → string)
  const serializedLockers = lockers.map((locker) => ({
    id: locker.id,
    lockerNumber: locker.lockerNumber,
    zone: locker.zone,
    slots: locker.slots.map(
      (slot): SlotData => ({
        id: slot.id,
        slotPosition: slot.slotPosition,
        wine: slot.wine
          ? {
              id: slot.wine.id,
              name: slot.wine.name,
              vintage: slot.wine.vintage,
              region: slot.wine.region,
              varietal: slot.wine.varietal,
              currentValue: slot.wine.currentValue.toString(),
              drinkWindowStart: slot.wine.drinkWindowStart ?? null,
              drinkWindowEnd: slot.wine.drinkWindowEnd ?? null,
            }
          : null,
        dateStored: slot.dateStored?.toISOString() ?? null,
      })
    ),
    occupiedCount: locker.slots.filter((s) => s.wineId != null).length,
    totalSlots: 32,
  }));

  return (
    <div className="p-6 md:p-10">
      <LockerSelector lockers={serializedLockers} unassignedWines={unassignedWines} />
    </div>
  );
}
