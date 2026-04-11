import { NextRequest, NextResponse } from "next/server";
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

  // Verify wine belongs to this member
  const wine = await prisma.wine.findFirst({
    where: { id, memberId: session.user.id },
    select: { id: true },
  });

  if (!wine) {
    return NextResponse.json({ error: "Wine not found" }, { status: 404 });
  }

  const valuations = await prisma.wineValuation.findMany({
    where: { wineId: id },
    orderBy: { date: "asc" },
  });

  const serialized = valuations.map((v) => ({
    id: v.id,
    wineId: v.wineId,
    source: v.source,
    price: Number(v.price),
    date: v.date.toISOString(),
  }));

  return NextResponse.json(serialized);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify wine belongs to this member
  const wine = await prisma.wine.findFirst({
    where: { id, memberId: session.user.id },
    select: { id: true },
  });

  if (!wine) {
    return NextResponse.json({ error: "Wine not found" }, { status: 404 });
  }

  const body = await request.json();
  const { price, source, date } = body;

  const priceNum = Number(price);
  if (isNaN(priceNum) || priceNum < 0 || priceNum > 10_000_000) {
    return NextResponse.json(
      { error: "Invalid price" },
      { status: 400 }
    );
  }

  const validSources = ["manual", "liv-ex", "wine-searcher", "auction"];
  const sourceStr = validSources.includes(source) ? source : "manual";

  const dateVal = date ? new Date(date) : new Date();
  if (isNaN(dateVal.getTime())) {
    return NextResponse.json(
      { error: "Invalid date" },
      { status: 400 }
    );
  }

  // Create the valuation and update the wine's current value
  const [valuation] = await prisma.$transaction([
    prisma.wineValuation.create({
      data: {
        wineId: id,
        source: sourceStr,
        price: priceNum,
        date: dateVal,
      },
    }),
    prisma.wine.update({
      where: { id },
      data: { currentValue: priceNum },
    }),
  ]);

  return NextResponse.json(
    {
      id: valuation.id,
      wineId: valuation.wineId,
      source: valuation.source,
      price: Number(valuation.price),
      date: valuation.date.toISOString(),
    },
    { status: 201 }
  );
}
