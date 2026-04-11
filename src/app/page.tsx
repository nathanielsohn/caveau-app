import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatTemp,
  formatHumidity,
  toNumber,
} from "@/lib/utils";
import DashboardClient from "./dashboard-client";

// Force dynamic rendering — data comes from the database
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const memberId = session.user.id;

  try {
    // Fetch all data in parallel, scoped to this member
    const [
      wines,
      memberLockerIds,
      bottlesStored,
      totalSlots,
    ] = await Promise.all([
      prisma.wine.findMany({
        where: { memberId, status: "in_cellar" },
        orderBy: { currentValue: "desc" },
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
        where: {
          wineId: { not: null },
          locker: { memberId },
        },
      }),
      prisma.lockerSlot.count({
        where: { locker: { memberId } },
      }),
    ]);

    const lockerIds = memberLockerIds.map((l) => l.id);

    // Fetch data that depends on lockerIds
    const [latestReading, recentAlerts, valuationRows, alertFrequencyRows] =
      await Promise.all([
        lockerIds.length > 0
          ? prisma.sensorReading.findFirst({
              where: { lockerId: { in: lockerIds } },
              orderBy: { timestamp: "desc" },
            })
          : null,
        prisma.alert.findMany({
          where: { lockerId: { in: lockerIds } },
          orderBy: { timestamp: "desc" },
          take: 5,
          include: { locker: true },
        }),
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
        lockerIds.length > 0
          ? prisma.$queryRaw<{ day: string; count: bigint }[]>`
              SELECT
                to_char(timestamp, 'MM/DD') AS day,
                COUNT(*)::bigint AS count
              FROM alerts
              WHERE locker_id = ANY(${lockerIds})
                AND timestamp >= NOW() - INTERVAL '30 days'
              GROUP BY to_char(timestamp, 'YYYY-MM-DD'), to_char(timestamp, 'MM/DD')
              ORDER BY to_char(timestamp, 'YYYY-MM-DD') ASC
            `
          : [],
      ]);

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
      temperature: latestReading
        ? formatTemp(latestReading.temperature)
        : "—",
      humidity: latestReading
        ? formatHumidity(latestReading.humidity)
        : "—",
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
    console.error("Dashboard data fetch failed:", error);
    return (
      <DashboardClient
        metrics={{
          totalValue: "$0",
          valueTrend: 0,
          bottleCount: 0,
          totalSlots: 32,
          temperature: "—",
          humidity: "—",
        }}
        topWines={[]}
        alerts={[]}
        valuationTrend={[]}
        alertFrequency={[]}
        topGainers={[]}
        topLosers={[]}
      />
    );
  }
}
