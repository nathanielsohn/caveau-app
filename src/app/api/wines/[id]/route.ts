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

  const wine = await prisma.wine.findFirst({
    where: { id, memberId: session.user.id },
    include: {
      lockerSlots: {
        include: {
          locker: {
            select: { id: true, lockerNumber: true, zone: true },
          },
        },
      },
      valuations: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!wine) {
    return NextResponse.json({ error: "Wine not found" }, { status: 404 });
  }

  const serialized = {
    ...wine,
    purchasePrice: Number(wine.purchasePrice),
    currentValue: Number(wine.currentValue),
    valuations: wine.valuations.map((v) => ({
      ...v,
      price: Number(v.price),
    })),
  };

  return NextResponse.json(serialized);
}
