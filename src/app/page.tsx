import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  formatCurrency,
  formatCurrencyCompact,
  toNumber,
} from "@/lib/utils";
import DashboardClient from "./dashboard-client";

// Force dynamic rendering — data comes from the database
export const dynamic = "force-dynamic";

/**
 * Wrap a promise with a hard timeout. If the query hangs we'd rather see
 * a partially-populated dashboard than a spinning page — the secondary
 * queries all have sensible empty fallbacks.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms),
    ),
  ]);
}

export default async function DashboardPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const memberId = session.user.id;

  try {
    // Dashboard is a portfolio-wide summary — every query aggregates across
    // every facility the member belongs to. Per-facility breakdowns live on
    // /collection, /locker, /sentinel, which use the facility switcher.
    const [
      wines,
      memberLockerIds,
      bottlesStored,
      totalSlots,
      facilityCount,
    ] = await Promise.all([
      prisma.wine.findMany({
        where: { memberId, status: "in_cellar" },
        orderBy: { currentValue: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          vintage: true,
          region: true,
          currentValue: true,
          purchasePrice: true,
        },
      }),
      prisma.locker.findMany({
        where: { memberId },
        select: { id: true },
      }),
      prisma.lockerSlot.count({
        where: { wineId: { not: null }, locker: { memberId } },
      }),
      prisma.lockerSlot.count({
        where: { locker: { memberId } },
      }),
      prisma.facilityMember.count({ where: { memberId } }),
    ]);

    const lockerIds = memberLockerIds.map((l) => l.id);

    // Fetch secondary data — use allSettled so one failure doesn't kill the
    // dashboard, and cap each query at 2.5s so a slow aggregation can't hold
    // the whole page hostage.
    const SECONDARY_TIMEOUT = 2500;
    const [activeAlertResult, alertsResult, valuationResult, alertFreqResult] =
      await Promise.allSettled([
        lockerIds.length > 0
          ? withTimeout(
              prisma.alert.count({
                where: { lockerId: { in: lockerIds }, resolved: false },
              }),
              SECONDARY_TIMEOUT,
              "active-alerts",
            )
          : Promise.resolve(0),
        withTimeout(
          prisma.alert.findMany({
            where: { lockerId: { in: lockerIds } },
            orderBy: { timestamp: "desc" },
            take: 5,
            select: {
              id: true,
              type: true,
              severity: true,
              message: true,
              timestamp: true,
              resolved: true,
              locker: {
                select: {
                  lockerNumber: true,
                  facility: { select: { name: true } },
                },
              },
            },
          }),
          SECONDARY_TIMEOUT,
          "recent-alerts",
        ),
        withTimeout(
          prisma.$queryRaw<{ month: string; total: number }[]>`
            SELECT
              to_char(wv.date, 'YYYY-MM') AS month,
              SUM(wv.price)::float AS total
            FROM wine_valuations wv
            JOIN wines w ON w.id = wv.wine_id
            WHERE w.member_id = ${memberId}
              AND wv.date >= NOW() - INTERVAL '12 months'
            GROUP BY to_char(wv.date, 'YYYY-MM')
            ORDER BY month ASC
          `,
          SECONDARY_TIMEOUT,
          "valuation-trend",
        ),
        lockerIds.length > 0
          ? withTimeout(
              prisma.$queryRaw<{ day: string; count: bigint }[]>`
                SELECT
                  to_char(timestamp, 'MM/DD') AS day,
                  COUNT(*)::bigint AS count
                FROM alerts
                WHERE locker_id = ANY(${lockerIds})
                  AND timestamp >= NOW() - INTERVAL '30 days'
                GROUP BY to_char(timestamp, 'YYYY-MM-DD'), to_char(timestamp, 'MM/DD')
                ORDER BY to_char(timestamp, 'YYYY-MM-DD') ASC
              `,
              SECONDARY_TIMEOUT,
              "alert-frequency",
            )
          : [],
      ]);

    const activeAlertCount =
      activeAlertResult.status === "fulfilled" ? activeAlertResult.value ?? 0 : 0;
    const recentAlerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];
    const valuationRows = valuationResult.status === "fulfilled" ? valuationResult.value : [];
    const alertFrequencyRows = alertFreqResult.status === "fulfilled" ? alertFreqResult.value : [];

    // Calculate total collection value
    const totalValue = wines.reduce(
      (sum, w) => sum + toNumber(w.currentValue),
      0
    );

    // Calculate total purchase price for trend
    const totalPurchase = wines.reduce(
      (sum, w) => sum + toNumber(w.purchasePrice),
      0
    );
    const valueTrend =
      totalPurchase > 0
        ? ((totalValue - totalPurchase) / totalPurchase) * 100
        : 0;

    // Serialize data for the client component
    const metricsData = {
      totalValue: formatCurrencyCompact(totalValue),
      valueTrend: Math.round(valueTrend * 10) / 10,
      bottleCount: bottlesStored,
      totalSlots,
      activeAlertCount,
      facilityCount,
    };

    // Calculate per-wine appreciation for sorting
    const winesWithAppreciation = wines.map((w) => ({
      ...w,
      appreciationPct:
        toNumber(w.purchasePrice) > 0
          ? Math.round(
              ((toNumber(w.currentValue) - toNumber(w.purchasePrice)) /
                toNumber(w.purchasePrice)) *
                1000
            ) / 10
          : 0,
    }));

    const topWines = winesWithAppreciation.slice(0, 5).map((w) => ({
      id: w.id,
      name: w.name,
      vintage: w.vintage,
      region: w.region,
      currentValue: formatCurrency(w.currentValue),
      purchasePrice: formatCurrency(w.purchasePrice),
      appreciation: w.appreciationPct,
    }));

    // Top gainers and losers by appreciation percentage
    const sorted = [...winesWithAppreciation].sort(
      (a, b) => b.appreciationPct - a.appreciationPct
    );
    const topGainers = sorted.slice(0, 3).map((w) => ({
      id: w.id,
      name: w.name,
      vintage: w.vintage,
      appreciation: w.appreciationPct,
      currentValue: formatCurrency(w.currentValue),
    }));
    const topLosers = sorted
      .slice(-3)
      .reverse()
      .filter((w) => w.appreciationPct < 0)
      .map((w) => ({
        id: w.id,
        name: w.name,
        vintage: w.vintage,
        appreciation: w.appreciationPct,
        currentValue: formatCurrency(w.currentValue),
      }));

    const serializedAlerts = recentAlerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      timestamp: a.timestamp.toISOString(),
      resolved: a.resolved,
      lockerNumber: a.locker?.lockerNumber ?? 0,
      facilityName: a.locker?.facility?.name ?? "",
    }));

    // Format valuation trend for charts
    const valuationTrend = valuationRows.map((row) => ({
      date: row.month,
      value: Number(row.total),
    }));

    // Format alert frequency for charts (bigint -> number)
    const alertFrequency = alertFrequencyRows.map((row) => ({
      date: row.day,
      count: Number(row.count),
    }));

    return (
      <DashboardClient
        metrics={metricsData}
        topWines={topWines}
        alerts={serializedAlerts}
        valuationTrend={valuationTrend}
        alertFrequency={alertFrequency}
        topGainers={topGainers}
        topLosers={topLosers}
      />
    );
  } catch (error) {
    logger.error("Dashboard data fetch failed", error, {
      route: "/",
      userId: memberId,
    });
    return (
      <div className="p-6 md:p-10">
        <div className="glass-card p-10 text-center">
          <p className="text-danger text-lg font-serif mb-2">
            Unable to load dashboard
          </p>
          <p className="text-secondary text-sm">
            There was a problem fetching your data. Please refresh the page or try again later.
          </p>
        </div>
      </div>
    );
  }
}
