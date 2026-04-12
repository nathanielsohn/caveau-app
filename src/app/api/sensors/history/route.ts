import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { SensorHistoryQuerySchema, parseOr400 } from "@/lib/schemas";

const RANGE_HOURS = {
  "1h": 1,
  "6h": 6,
  "24h": 24,
  "7d": 168,
  "30d": 720,
} as const satisfies Record<string, number>;

export async function GET(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const parsed = parseOr400(SensorHistoryQuerySchema, {
    lockerId: searchParams.get("lockerId"),
    range: searchParams.get("range") ?? undefined,
  });
  if (!parsed.ok) return parsed.response;

  const { lockerId, range } = parsed.data;

  // Verify the locker belongs to this member
  const locker = await prisma.locker.findFirst({
    where: { id: lockerId, memberId: session.user.id },
    select: { id: true },
  });

  if (!locker) {
    return NextResponse.json({ error: "Locker not found" }, { status: 404 });
  }

  const hours = RANGE_HOURS[range as keyof typeof RANGE_HOURS];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const readings = await prisma.sensorReading.findMany({
    where: {
      lockerId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "asc" },
    take: hours <= 24 ? 500 : 1000,
  });

  const serialized = readings.map((r) => ({
    temperature: Number(r.temperature),
    humidity: Number(r.humidity),
    vibration: Number(r.vibration),
    lightLux: Number(r.lightLux),
    timestamp: r.timestamp.toISOString(),
  }));

  return NextResponse.json(serialized);
}
