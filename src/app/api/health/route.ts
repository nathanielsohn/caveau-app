import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Health endpoint for uptime checks and load balancer probes.
 *
 * Returns 200 only when the database is reachable. Intentionally unauthenticated
 * — health checks should not require credentials. Doesn't expose any data
 * beyond a status string and a timestamp.
 */
export async function GET() {
  const start = Date.now();
  try {
    // Cheapest possible round-trip. SELECT 1 keeps the connection pool warm
    // without touching any application table.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        ts: new Date().toISOString(),
        dbLatencyMs: Date.now() - start,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", ts: new Date().toISOString() },
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
