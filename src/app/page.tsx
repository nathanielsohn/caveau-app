import { prisma } from "@/lib/prisma";
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
  try {
    // Fetch all data in parallel
    const [
      wines,
      latestReading,
      recentAlerts,
      bottlesStored,
      totalSlots,
      valuationRows,
      alertFrequencyRows,
    ] = await Promise.all([
      prisma.wine.findMany({
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
      prisma.sensorReading.findFirst({
        orderBy: { timestamp: "desc" },
      }),
      prisma.alert.findMany({
        orderBy: { timestamp: "desc" },
        take: 5,
        include: { locker: true },
      }),
      prisma.lockerSlot.count({
        where: { wineId: { not: null } },
      }),
      // Total locker slots (not hardcoded)
      prisma.lockerSlot.count(),
      // Collection value trend: sum all wine valuation prices grouped by month
      prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT
          to_char(date, 'YYYY-MM') AS month,
          SUM(price)::float AS total
        FROM wine_valuations
        WHERE date >= NOW() - INTERVAL '12 months'
        GROUP BY to_char(date, 'YYYY-MM')
        ORDER BY month ASC
      `,
      // Alert frequency: count alerts grouped by day over last 30 days
      prisma.$queryRaw<{ day: string; count: bigint }[]>`
        SELECT
          to_char(timestamp, 'MM/DD') AS day,
          COUNT(*)::bigint AS count
        FROM alerts
        WHERE timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY to_char(timestamp, 'YYYY-MM-DD'), to_char(timestamp, 'MM/DD')
        ORDER BY to_char(timestamp, 'YYYY-MM-DD') ASC
      `,
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

    const topWines = wines.slice(0, 5).map((w) => ({
      id: w.id,
      name: w.name,
      vintage: w.vintage,
      region: w.region,
      currentValue: formatCurrency(w.currentValue),
      purchasePrice: formatCurrency(w.purchasePrice),
      appreciation:
        toNumber(w.purchasePrice) > 0
          ? Math.round(
              ((toNumber(w.currentValue) - toNumber(w.purchasePrice)) /
                toNumber(w.purchasePrice)) *
                1000
            ) / 10
          : 0,
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
      />
    );
  }
}
