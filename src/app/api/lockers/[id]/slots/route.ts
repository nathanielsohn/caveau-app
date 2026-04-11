import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const locker = await prisma.locker.findFirst({
    where: { id, memberId: session.user.id },
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
