import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  UuidSchema,
  ValuationBodySchema,
  parsePathParamOr404,
  parseOr400,
} from "@/lib/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

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

  const ip = clientIp(headers());
  const limit = await checkRateLimit(
    `valuation-create:${session.user.id}:${ip}`,
    { limit: 30, windowMs: 60_000 },
  );
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;
  const id = idResult.data;

  // Verify wine belongs to this member
  const wine = await prisma.wine.findFirst({
    where: { id, memberId: session.user.id },
    select: { id: true },
  });

  if (!wine) {
    return NextResponse.json({ error: "Wine not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(ValuationBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const { price: priceNum, source, date } = parsed.data;
  const sourceStr = source ?? "manual";

  // Date validation: parsed via schemas accepts ISO/yyyy-mm-dd; default to now.
  const dateVal = date ? new Date(date) : new Date();
  if (isNaN(dateVal.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  // Create the valuation. Only update wine.currentValue when this entry is
  // at least as recent as every existing valuation — otherwise a backdated
  // entry would silently overwrite the live current value.
  const valuation = await prisma.$transaction(async (tx) => {
    const created = await tx.wineValuation.create({
      data: {
        wineId: id,
        source: sourceStr,
        price: priceNum,
        date: dateVal,
      },
    });

    const latest = await tx.wineValuation.findFirst({
      where: { wineId: id },
      orderBy: { date: "desc" },
      select: { id: true, price: true },
    });

    if (latest && latest.id === created.id) {
      await tx.wine.update({
        where: { id },
        data: { currentValue: priceNum },
      });
    }

    return created;
  });

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
