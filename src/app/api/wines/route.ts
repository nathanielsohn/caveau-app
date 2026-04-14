import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { getPublicUrl } from "@/lib/s3";
import { CreateWineBodySchema, parseOr400 } from "@/lib/schemas";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

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
    take: 500,
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      producer: true,
      purchasePrice: true,
      currentValue: true,
      imageKey: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      createdAt: true,
    },
  });

  const serialized = wines.map((w) => ({
    ...w,
    purchasePrice: Number(w.purchasePrice),
    currentValue: Number(w.currentValue),
    photoUrl: getPublicUrl(w.imageKey),
  }));

  return NextResponse.json(serialized);
}

export async function POST(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(headers());
  const limit = await checkRateLimit(`wine-create:${session.user.id}:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(CreateWineBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const { imageKey, ...wineData } = parsed.data;
  // Defense-in-depth: only accept image keys under the caller's own member
  // prefix. Mirrors the same check in the collection page server action.
  const safeImageKey =
    imageKey && imageKey.startsWith(`wines/${session.user.id}/`)
      ? imageKey
      : null;

  try {
    const wine = await prisma.wine.create({
      data: {
        ...wineData,
        currentValue: wineData.purchasePrice,
        memberId: session.user.id,
        ...(safeImageKey ? { imageKey: safeImageKey } : {}),
      },
    });

    return NextResponse.json(
      {
        ...wine,
        purchasePrice: Number(wine.purchasePrice),
        currentValue: Number(wine.currentValue),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Failed to create wine" }, { status: 500 });
  }
}
