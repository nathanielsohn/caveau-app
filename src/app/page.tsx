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
    const [wines, latestReading, recentAlerts, bottlesStored] =
      await Promise.all([
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
      totalSlots: 32,
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
      lockerNumber: a.locker.lockerNumber,
    }));

    return (
      <DashboardClient
        metrics={metricsData}
        topWines={topWines}
        alerts={serializedAlerts}
      />
    );
  } catch {
    // Graceful fallback when DB is unreachable
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
      />
    );
  }
}
