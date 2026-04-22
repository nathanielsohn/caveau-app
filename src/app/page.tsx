import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  formatCurrency,
  formatCurrencyCompact,
  toNumber,
} from "@/lib/utils";
import {
  computePortfolioSummary,
  type PortfolioWineInput,
} from "@/lib/investment";
import {
  buildPortfolioVsLivexSeries,
  type TimeseriesWine,
} from "@/lib/portfolio-timeseries";
import { isActiveStage } from "@/lib/hurricane";
import { reasonLabel } from "@/lib/exit-signals";
import { estimateInsuranceSavings } from "@/lib/insurance";
import { tierSpecForDbTier } from "@/lib/tiers";
import { checkWelcomeEligibility } from "@/lib/appraisals";
import DashboardClient from "./dashboard-client";
import HurricaneBanner from "@/components/hurricane-banner";

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
      latestSyncRow,
      latestValuationRow,
      hurricaneMembership,
      openExitSignals,
      openExitSignalCount,
      livexPoints,
    ] = await Promise.all([
      prisma.wine.findMany({
        where: { memberId, status: "in_cellar" },
        orderBy: { currentValue: "desc" },
        take: 500,
        select: {
          id: true,
          name: true,
          producer: true,
          vintage: true,
          region: true,
          currentValue: true,
          purchasePrice: true,
          createdAt: true,
          // Full valuation history. `valuations[0]` is still the
          // earliest (asc order), which #45's CAGR anchor uses; the
          // broader list feeds the portfolio-vs-Liv-ex timeseries
          // reconstruction for #57.
          valuations: {
            orderBy: { date: "asc" },
            select: { price: true, date: true },
          },
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
      // Most recent Liv-ex sync across the member's collection (feature #39).
      // Powers the "Updated <relative>" footnote on the Collection Value
      // card. When no wine has ever been synced (dev / unconfigured), this
      // returns null and the UI falls back to the latest WineValuation.date.
      prisma.wine.findFirst({
        where: { memberId, lastValuationSyncAt: { not: null } },
        orderBy: { lastValuationSyncAt: "desc" },
        select: { lastValuationSyncAt: true },
      }),
      // Fallback anchor for the "Updated <relative>" footnote when no wine
      // has ever been Liv-ex synced (dev / unconfigured installs). Running
      // this unconditionally alongside the sync-stamp query keeps both
      // lookups in the same round-trip — cheaper than the old pattern of
      // firing a sequential fallback query only when the primary returned
      // null. On a configured deployment this row is ignored.
      prisma.wineValuation.findFirst({
        where: { wine: { memberId } },
        orderBy: { date: "desc" },
        select: { date: true },
      }),
      // Active hurricane protocol for this member, if any (feature #46).
      // Surfaces the dashboard banner. One row at most while a protocol is
      // live (returned / cancelled filter drops terminal rows).
      prisma.hurricaneProtocolMember.findFirst({
        where: {
          memberId,
          protocol: { stage: { notIn: ["returned", "cancelled"] } },
        },
        orderBy: { createdAt: "desc" },
        include: {
          protocol: {
            select: {
              stormName: true,
              category: true,
              stage: true,
              facility: { select: { name: true } },
            },
          },
        },
      }),
      // Open exit signals (feature #55). Capped at 4 for the dashboard
      // teaser card; the full list lives on each wine detail page.
      prisma.exitSignal.findMany({
        where: { memberId, closedAt: null },
        orderBy: [{ strength: "desc" }, { openedAt: "desc" }],
        take: 4,
        include: {
          wine: { select: { id: true, name: true, vintage: true } },
        },
      }),
      prisma.exitSignal.count({
        where: { memberId, closedAt: null },
      }),
      // Liv-ex Fine Wine 100 history for the Portfolio vs. Liv-ex 100
      // chart (feature #57). 18 months is enough for a YTD window plus
      // the trailing-12m fallback we use when YTD has too few points.
      prisma.livexBenchmark.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { date: "asc" },
        select: { date: true, indexValue: true },
      }),
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
                where: {
                  lockerId: { in: lockerIds },
                  resolved: false,
                  source: "device",
                },
              }),
              SECONDARY_TIMEOUT,
              "active-alerts",
            )
          : Promise.resolve(0),
        withTimeout(
          prisma.alert.findMany({
            where: { lockerId: { in: lockerIds }, source: "device" },
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

    // Fall back to the most recent WineValuation.date when no wine has a
    // real Liv-ex sync stamped. The fallback row was prefetched in the
    // initial Promise.all so no extra round-trip is needed.
    const latestSyncAt: Date | null =
      latestSyncRow?.lastValuationSyncAt ?? latestValuationRow?.date ?? null;

    // Serialize data for the client component
    const metricsData = {
      totalValue: formatCurrencyCompact(totalValue),
      valueTrend: Math.round(valueTrend * 10) / 10,
      bottleCount: bottlesStored,
      totalSlots,
      activeAlertCount,
      facilityCount,
      latestValuationSyncAt: latestSyncAt ? latestSyncAt.toISOString() : null,
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

    // Investment portfolio summary (feature #45) — only surfaces on the
    // dashboard card when the member holds at least one classified bottle.
    const portfolioInputs: PortfolioWineInput[] = wines.map((w) => ({
      producer: w.producer,
      name: w.name,
      vintage: w.vintage,
      purchasePrice: toNumber(w.purchasePrice),
      currentValue: toNumber(w.currentValue),
      createdAt: w.createdAt,
      earliestValuation: w.valuations[0]
        ? { price: toNumber(w.valuations[0].price), date: w.valuations[0].date }
        : null,
    }));
    const portfolioSummary = computePortfolioSummary(portfolioInputs);
    const portfolioData =
      portfolioSummary.bottleCount > 0
        ? {
            bottleCount: portfolioSummary.bottleCount,
            current: formatCurrencyCompact(portfolioSummary.current),
            cagr: portfolioSummary.cagr,
            projectedFive:
              portfolioSummary.projectedFive != null
                ? formatCurrencyCompact(portfolioSummary.projectedFive)
                : null,
            sp500ProjectedFive: formatCurrencyCompact(
              portfolioSummary.sp500ProjectedFive,
            ),
            vsSp500:
              portfolioSummary.projectedFive != null
                ? portfolioSummary.projectedFive -
                  portfolioSummary.sp500ProjectedFive
                : null,
          }
        : null;

    const activeHurricane =
      hurricaneMembership && isActiveStage(hurricaneMembership.protocol.stage)
        ? hurricaneMembership
        : null;

    // Welcome appraisal nudge (feature #61). Only surfaces on the
    // dashboard for founding members who haven't claimed yet —
    // non-founding members and members with a pending/completed
    // welcome appraisal see nothing here (settings has the fuller
    // status row for the other cases).
    const memberFounding = await prisma.member.findUnique({
      where: { id: memberId },
      select: { foundingMember: true },
    });
    const welcomeDecision = memberFounding?.foundingMember
      ? await checkWelcomeEligibility(memberId, memberFounding.foundingMember)
      : null;
    const welcomeAppraisalAvailable = welcomeDecision?.eligible ?? false;

    // Serialize exit signals for the client card (feature #55). Converts
    // Prisma.Decimal into plain numbers so the card renders currency
    // without each row re-coercing on click.
    const exitSignalsForClient = openExitSignals.map((s) => ({
      id: s.id,
      wineId: s.wineId,
      wineName: s.wine.name,
      wineVintage: s.wine.vintage,
      reason: s.reason,
      reasonLabel: reasonLabel(s.reason),
      strength: s.strength,
      rationale: s.rationale,
      targetPriceLow: formatCurrency(toNumber(s.targetPriceLow)),
      targetPriceHigh: formatCurrency(toNumber(s.targetPriceHigh)),
    }));

    // Insurance savings estimate (feature #56). Collection value comes
    // from the same in-cellar wine sum used for the Collection Value
    // metric card; tier comes off the session so no extra DB hit.
    const insuranceEstimate = estimateInsuranceSavings({
      collectionValueUsd: totalValue,
      tier: tierSpecForDbTier(session.user.tier).slug,
    });

    // Portfolio vs. Liv-ex 100 timeseries (feature #57). Uses the same
    // `wines` result — no extra DB query — plus the Liv-ex snapshots
    // from the initial Promise.all.
    const timeseriesWines: TimeseriesWine[] = wines.map((w) => ({
      createdAt: w.createdAt,
      purchasePrice: toNumber(w.purchasePrice),
      valuations: w.valuations.map((v) => ({
        date: v.date,
        price: toNumber(v.price),
      })),
    }));
    const vsLivex = buildPortfolioVsLivexSeries({
      wines: timeseriesWines,
      livexPoints: livexPoints.map((p) => ({
        date: p.date,
        indexValue: toNumber(p.indexValue),
      })),
      now: new Date(),
    });
    const portfolioVsLivex = {
      hasData: vsLivex.points.length >= 2,
      windowType: vsLivex.windowType,
      portfolioChangePct: vsLivex.portfolioChangePct,
      livexChangePct: vsLivex.livexChangePct,
      deltaPct: vsLivex.deltaPct,
    };

    return (
      <>
        {activeHurricane && (
          <HurricaneBanner
            stormName={activeHurricane.protocol.stormName}
            category={activeHurricane.protocol.category}
            stage={activeHurricane.protocol.stage}
            bottleCount={activeHurricane.bottleCountSnapshot}
            facilityName={activeHurricane.protocol.facility.name}
          />
        )}
        <DashboardClient
          metrics={metricsData}
          topWines={topWines}
          alerts={serializedAlerts}
          valuationTrend={valuationTrend}
          alertFrequency={alertFrequency}
          topGainers={topGainers}
          topLosers={topLosers}
          portfolio={portfolioData}
          exitSignals={exitSignalsForClient}
          exitSignalTotal={openExitSignalCount}
          insuranceEstimate={insuranceEstimate}
          portfolioVsLivex={portfolioVsLivex}
          welcomeAppraisalAvailable={welcomeAppraisalAvailable}
          firstName={session.user.name?.split(" ")[0] ?? "Member"}
        />
      </>
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
