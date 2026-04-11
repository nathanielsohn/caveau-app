import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Single query: get latest sensor reading per locker using DISTINCT ON (PostgreSQL)
  const results = await prisma.$queryRaw<
    {
      locker_id: string;
      locker_number: number;
      temperature: number;
      humidity: number;
      vibration: number;
      light_lux: number;
      timestamp: Date;
    }[]
  >`
    SELECT DISTINCT ON (sr.locker_id)
      sr.locker_id,
      l.locker_number,
      sr.temperature,
      sr.humidity,
      sr.vibration,
      sr.light_lux,
      sr.timestamp
    FROM sensor_readings sr
    JOIN lockers l ON l.id = sr.locker_id
    WHERE l.member_id = ${session.user.id}
    ORDER BY sr.locker_id, sr.timestamp DESC
  `;

  const serialized = results.map((r) => ({
    lockerId: r.locker_id,
    lockerNumber: r.locker_number,
    temperature: Number(r.temperature),
    humidity: Number(r.humidity),
    vibration: Number(r.vibration),
    lightLux: Number(r.light_lux),
    timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
  }));

  return NextResponse.json(serialized);
}
