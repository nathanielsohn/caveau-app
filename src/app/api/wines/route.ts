import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search")?.trim();
  const region = searchParams.get("region")?.trim();
  const varietal = searchParams.get("varietal")?.trim();

  const where: Record<string, unknown> = { memberId: session.user.id };

  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }
  if (region) {
    where.region = { equals: region, mode: "insensitive" };
  }
  if (varietal) {
    where.varietal = { equals: varietal, mode: "insensitive" };
  }

  const wines = await prisma.wine.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      producer: true,
      purchasePrice: true,
      currentValue: true,
      imageUrl: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      createdAt: true,
    },
  });

  const serialized = wines.map((w) => ({
    ...w,
    purchasePrice: Number(w.purchasePrice),
    currentValue: Number(w.currentValue),
  }));

  return NextResponse.json(serialized);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, vintage, region, varietal, producer, purchasePrice } = body;

  if (!name || !region || !varietal || !producer) {
    return NextResponse.json(
      { error: "name, region, varietal, and producer are required" },
      { status: 400 }
    );
  }

  const vintageNum = Number(vintage);
  if (isNaN(vintageNum) || vintageNum < 1800 || vintageNum > new Date().getFullYear() + 1) {
    return NextResponse.json(
      { error: "Invalid vintage year" },
      { status: 400 }
    );
  }

  const priceNum = Number(purchasePrice);
  if (isNaN(priceNum) || priceNum < 0 || priceNum > 10_000_000) {
    return NextResponse.json(
      { error: "Invalid purchase price" },
      { status: 400 }
    );
  }

  const wine = await prisma.wine.create({
    data: {
      name: String(name).slice(0, 500),
      vintage: vintageNum,
      region: String(region),
      varietal: String(varietal),
      producer: String(producer),
      purchasePrice: priceNum,
      currentValue: priceNum,
      memberId: session.user.id,
    },
  });

  return NextResponse.json(
    { ...wine, purchasePrice: Number(wine.purchasePrice), currentValue: Number(wine.currentValue) },
    { status: 201 }
  );
}
