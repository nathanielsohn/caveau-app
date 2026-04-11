import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const resolvedParam = searchParams.get("resolved");

  const lockerIds = await prisma.locker.findMany({
    where: { memberId: session.user.id },
    select: { id: true },
  });

  const where: Record<string, unknown> = {
    lockerId: { in: lockerIds.map((l) => l.id) },
  };

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
