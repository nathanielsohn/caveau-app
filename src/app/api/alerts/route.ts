import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const resolvedParam = searchParams.get("resolved");

  const where: Record<string, unknown> = {};
  if (resolvedParam === "true") {
    where.resolved = true;
  } else if (resolvedParam === "false") {
    where.resolved = false;
  }

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 100,
    include: {
      locker: {
        select: { id: true, lockerNumber: true, zone: true },
      },
    },
  });

  const serialized = alerts.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    message: a.message,
    timestamp: a.timestamp.toISOString(),
    resolved: a.resolved,
    locker: a.locker,
  }));

  return NextResponse.json(serialized);
}
