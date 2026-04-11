import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const lockers = await prisma.locker.findMany({
    select: { id: true, lockerNumber: true },
    orderBy: { lockerNumber: "asc" },
  });

  const results = await Promise.all(
    lockers.map(async (locker) => {
      const reading = await prisma.sensorReading.findFirst({
        where: { lockerId: locker.id },
        orderBy: { timestamp: "desc" },
      });

      if (!reading) return null;

      return {
        lockerId: locker.id,
        lockerNumber: locker.lockerNumber,
        temperature: Number(reading.temperature),
        humidity: Number(reading.humidity),
        vibration: Number(reading.vibration),
        lightLux: Number(reading.lightLux),
        timestamp: reading.timestamp.toISOString(),
      };
    })
  );

  return NextResponse.json(results.filter(Boolean));
}
