import { prisma } from "@/lib/prisma";
import { Lock } from "lucide-react";
import { type SlotData } from "@/components/locker-grid";
import LockerSelector from "./locker-selector";

export const dynamic = "force-dynamic";

/** The hardcoded demo member email */
const DEMO_MEMBER_EMAIL = "robert@caveau.com";

async function getLockers() {
  const member = await prisma.member.findUnique({
    where: { email: DEMO_MEMBER_EMAIL },
    select: { id: true },
  });

  if (!member) return [];

  const lockers = await prisma.locker.findMany({
    where: { memberId: member.id },
    orderBy: { lockerNumber: "asc" },
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
            },
          },
        },
      },
    },
  });

  return lockers;
}

export default async function LockerPage() {
  const lockers = await getLockers();

  if (lockers.length === 0) {
    return (
      <div className="p-6 md:p-10">
        <div className="glass-card p-10 text-center">
          <Lock size={40} className="text-muted mx-auto mb-4" />
          <h2 className="font-serif text-xl text-primary mb-2">
            No Locker Assigned
          </h2>
          <p className="text-secondary text-sm">
            Contact Caveau to reserve your private storage locker.
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
      <LockerSelector lockers={serializedLockers} />
    </div>
  );
}
