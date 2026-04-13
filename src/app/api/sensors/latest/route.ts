import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireMemberFacility();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Latest sensor reading per locker, scoped to the member's lockers in the
  // active facility. DISTINCT ON gives us one row per locker without a
  // window function or N+1 round trips.
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
    WHERE l.member_id = ${ctx.memberId}
      AND l.facility_id = ${ctx.facilityId}
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
