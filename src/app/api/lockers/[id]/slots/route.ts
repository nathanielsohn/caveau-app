import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const locker = await prisma.locker.findUnique({
    where: { id },
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

  if (!locker) {
    return NextResponse.json({ error: "Locker not found" }, { status: 404 });
  }

  const serialized = locker.slots.map((slot) => ({
    id: slot.id,
    slotPosition: slot.slotPosition,
    dateStored: slot.dateStored,
    wine: slot.wine
      ? {
          ...slot.wine,
          currentValue: Number(slot.wine.currentValue),
        }
      : null,
  }));

  return NextResponse.json(serialized);
}
