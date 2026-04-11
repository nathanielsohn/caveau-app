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

  // Single query: filter through locker→member relation instead of separate locker ID lookup
  const resolvedFilter =
    resolvedParam === "true" ? true :
    resolvedParam === "false" ? false :
    undefined;

  const alerts = await prisma.alert.findMany({
    where: {
      locker: { memberId: session.user.id },
      ...(resolvedFilter !== undefined && { resolved: resolvedFilter }),
    },
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
