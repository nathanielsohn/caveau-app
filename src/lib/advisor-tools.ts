/**
 * Read-only tool functions for the AI Advisor (feature #50).
 *
 * Every tool enforces the jailbreak barrier server-side: it calls
 * `getServerAuth()` internally and scopes every query by the session's
 * member id. Tools never accept a `memberId` parameter from the caller,
 * so an LLM prompt asking the advisor to "check Rob's portfolio instead"
 * cannot bypass scoping — the tool has no way to change whose data it
 * sees. See docs/AI-ADVISOR-SPEC.md §Tools.
 *
 * All tools return plain objects (no Prisma Decimals, no relation shells)
 * so the chat route can JSON-serialize tool results straight into the
 * model turn.
 */

import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tierSpecForDbTier } from "@/lib/tiers";
import { toNumber, percentChange } from "@/lib/utils";
import { estimateInsuranceSavings } from "@/lib/insurance";
import {
  buildPortfolioVsLivexSeries,
  type TimeseriesWine,
} from "@/lib/portfolio-timeseries";
import {
  AdvisorWineIdParamSchema,
  AdvisorBenchmarkParamSchema,
} from "@/lib/schemas";
import {
  AcquisitionStatus,
  AllocationRequestStatus,
  AllocationStatus,
  AppraisalStatus,
  ExitStatus,
} from "@prisma/client";
import { decideEligibility, bottlesRemaining } from "@/lib/allocations";
import {
  checkWelcomeEligibility,
  resolveAppraisalPrice,
} from "@/lib/appraisals";
import { formatAcquisitionSpec } from "@/lib/acquisitions";
import { formatChannelWithHouse, MEMBER_STATUS_COPY } from "@/lib/exits";

/**
 * Thrown when a tool is invoked without an authenticated session. The
 * eventual chat route should map this to a 401 so a jailbreak attempt
 * surfaces clearly in logs instead of silently returning empty data.
 */
export class AdvisorAuthError extends Error {
  constructor() {
    super("Advisor tool called without an authenticated member session");
    this.name = "AdvisorAuthError";
  }
}

async function requireSession() {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new AdvisorAuthError();
  return session;
}

// ── getMemberPortfolio ──────────────────────────────────────────────────

const INVESTMENT_GRADE_USD = 1000;
const COLLECTOR_GRADE_USD = 200;

type InvestmentGrade = "investment" | "collector" | "everyday";

function classifyGrade(currentValueUsd: number): InvestmentGrade {
  if (currentValueUsd >= INVESTMENT_GRADE_USD) return "investment";
  if (currentValueUsd >= COLLECTOR_GRADE_USD) return "collector";
  return "everyday";
}

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface PortfolioWine {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  region: string;
  varietal: string;
  purchasePriceUsd: number;
  currentValueUsd: number;
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  status: string;
  lockerNumber: number | null;
  lockerZone: string | null;
  facilityName: string | null;
  cagrPct: number | null;
  oneYearChangePct: number | null;
  investmentGrade: InvestmentGrade;
  addedAt: string;
}

export interface MemberPortfolio {
  wines: PortfolioWine[];
  totals: {
    totalValueUsd: number;
    totalBasisUsd: number;
    ytdChangePct: number | null;
  };
}

/**
 * Returns the member's full collection plus computed per-bottle metrics
 * and portfolio totals. Covers the bulk of slide-6 "how's my portfolio"
 * questions in a single call.
 */
export async function getMemberPortfolio(): Promise<MemberPortfolio> {
  const session = await requireSession();
  const memberId = session.user.id;

  const wines = await prisma.wine.findMany({
    where: { memberId },
    include: {
      lockerSlots: {
        select: {
          locker: {
            select: {
              lockerNumber: true,
              zone: true,
              facility: { select: { name: true } },
            },
          },
        },
      },
      valuations: {
        orderBy: { date: "asc" },
        select: { date: true, price: true },
      },
    },
  });

  const now = Date.now();
  const oneYearAgo = new Date(now - 365 * MS_PER_DAY);
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  let totalValueUsd = 0;
  let totalBasisUsd = 0;
  let totalStartOfYearValueUsd = 0;

  const portfolioWines: PortfolioWine[] = wines.map((w) => {
    const purchasePriceUsd = toNumber(w.purchasePrice);
    const currentValueUsd = toNumber(w.currentValue);

    totalValueUsd += currentValueUsd;
    totalBasisUsd += purchasePriceUsd;

    // CAGR from purchase to current value. Floor elapsed time at 1 year so
    // a wine acquired 3 months ago doesn't report an annualized gain in the
    // hundreds of percent — that's numerically correct but misleading in a
    // chat answer and burns the advisor's credibility.
    const elapsedYears = Math.max(
      1,
      (now - w.createdAt.getTime()) / MS_PER_YEAR,
    );
    const cagrPct =
      purchasePriceUsd > 0 && currentValueUsd > 0
        ? (Math.pow(currentValueUsd / purchasePriceUsd, 1 / elapsedYears) - 1) *
          100
        : null;

    // 1-year change: compare the valuation closest to -365 days against the
    // latest valuation. Null if we don't have two distinct valuations to
    // span any range.
    let oneYearChangePct: number | null = null;
    if (w.valuations.length >= 2) {
      const latestV = w.valuations[w.valuations.length - 1];
      const closest = findClosestValuation(w.valuations, oneYearAgo);
      if (latestV && closest && closest !== latestV) {
        oneYearChangePct = percentChange(closest.price, latestV.price);
      }
    }

    // YTD component: valuation closest to Jan 1 of the current year, with a
    // fallback to the purchase price so wines without pre-year valuations
    // still contribute a reasonable baseline to the portfolio total.
    let startOfYearValue = purchasePriceUsd;
    if (w.valuations.length > 0) {
      const closest = findClosestValuation(w.valuations, startOfYear);
      if (closest) startOfYearValue = toNumber(closest.price);
    }
    totalStartOfYearValueUsd += startOfYearValue;

    const slot = w.lockerSlots[0] ?? null;

    return {
      id: w.id,
      name: w.name,
      producer: w.producer,
      vintage: w.vintage,
      region: w.region,
      varietal: w.varietal,
      purchasePriceUsd,
      currentValueUsd,
      drinkWindowStart: w.drinkWindowStart,
      drinkWindowEnd: w.drinkWindowEnd,
      status: w.status,
      lockerNumber: slot?.locker.lockerNumber ?? null,
      lockerZone: slot?.locker.zone ?? null,
      facilityName: slot?.locker.facility.name ?? null,
      cagrPct,
      oneYearChangePct,
      investmentGrade: classifyGrade(currentValueUsd),
      addedAt: w.createdAt.toISOString(),
    };
  });

  return {
    wines: portfolioWines,
    totals: {
      totalValueUsd,
      totalBasisUsd,
      ytdChangePct:
        totalStartOfYearValueUsd > 0
          ? percentChange(totalStartOfYearValueUsd, totalValueUsd)
          : null,
    },
  };
}

function findClosestValuation<T extends { date: Date }>(
  valuations: T[],
  target: Date,
): T | null {
  const first = valuations[0];
  if (!first) return null;
  const targetMs = target.getTime();
  let closest: T = first;
  let closestDelta = Math.abs(first.date.getTime() - targetMs);
  for (const v of valuations) {
    const delta = Math.abs(v.date.getTime() - targetMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = v;
    }
  }
  return closest;
}

// ── getLivexPriceHistory ────────────────────────────────────────────────

export interface LivexPricePoint {
  date: string;
  priceUsd: number;
  source: string;
}

/**
 * Returns the Liv-ex-sourced valuation history for a single wine the
 * member owns. Ownership is checked before the valuation lookup so an
 * attacker probing wine IDs gets a uniform error either way.
 */
export async function getLivexPriceHistory(params: {
  wineId: string;
}): Promise<LivexPricePoint[]> {
  const session = await requireSession();
  const { wineId } = AdvisorWineIdParamSchema.parse(params);

  const wine = await prisma.wine.findFirst({
    where: { id: wineId, memberId: session.user.id },
    select: { id: true },
  });
  if (!wine) {
    throw new Error("Wine not found");
  }

  const valuations = await prisma.wineValuation.findMany({
    where: { wineId, source: "liv-ex" },
    orderBy: { date: "asc" },
    select: { date: true, price: true, source: true },
  });

  return valuations.map((v) => ({
    date: v.date.toISOString(),
    priceUsd: toNumber(v.price),
    source: v.source,
  }));
}

// ── getActiveAlerts ─────────────────────────────────────────────────────

export const ADVISOR_ALERT_THRESHOLDS = {
  tempMinF: 50,
  tempMaxF: 59,
  humidityMinPct: 55,
  humidityMaxPct: 75,
  vibrationMaxMmPerS: 0.5,
} as const;

export interface ActiveAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  timestamp: string;
  lockerId: string;
  lockerNumber: number;
  lockerZone: string;
  facilityName: string;
  latestReading: {
    temperature: number;
    humidity: number;
    vibration: number;
    timestamp: string;
  } | null;
  thresholds: typeof ADVISOR_ALERT_THRESHOLDS;
}

/**
 * Unresolved alerts across every locker the member owns, with the latest
 * sensor reading for each affected locker attached as context. Powers Q3
 * of the canonical slide-6 questions — "should I worry about the alert".
 */
export async function getActiveAlerts(): Promise<ActiveAlert[]> {
  const session = await requireSession();
  const memberId = session.user.id;

  const alerts = await prisma.alert.findMany({
    where: {
      resolved: false,
      locker: { memberId },
    },
    orderBy: { timestamp: "desc" },
    include: {
      locker: {
        select: {
          id: true,
          lockerNumber: true,
          zone: true,
          facility: { select: { name: true } },
        },
      },
    },
  });

  const lockerIds = Array.from(new Set(alerts.map((a) => a.lockerId)));
  const latestByLocker = new Map<
    string,
    { temperature: number; humidity: number; vibration: number; timestamp: Date }
  >();
  if (lockerIds.length > 0) {
    // One groupBy to find the latest timestamp per locker, then one
    // findMany to hydrate the rows — O(1) DB round trips instead of O(N).
    const latestTimestamps = await prisma.sensorReading.groupBy({
      by: ["lockerId"],
      where: { lockerId: { in: lockerIds } },
      _max: { timestamp: true },
    });
    const timestampPairs = latestTimestamps
      .map((g) => ({ lockerId: g.lockerId, timestamp: g._max.timestamp }))
      .filter(
        (p): p is { lockerId: string; timestamp: Date } => p.timestamp != null,
      );
    if (timestampPairs.length > 0) {
      const readings = await prisma.sensorReading.findMany({
        where: {
          OR: timestampPairs.map((p) => ({
            lockerId: p.lockerId,
            timestamp: p.timestamp,
          })),
        },
      });
      for (const r of readings) {
        latestByLocker.set(r.lockerId, {
          temperature: toNumber(r.temperature),
          humidity: toNumber(r.humidity),
          vibration: toNumber(r.vibration),
          timestamp: r.timestamp,
        });
      }
    }
  }

  return alerts.map((a) => {
    const latest = latestByLocker.get(a.lockerId) ?? null;
    return {
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      timestamp: a.timestamp.toISOString(),
      lockerId: a.locker.id,
      lockerNumber: a.locker.lockerNumber,
      lockerZone: a.locker.zone,
      facilityName: a.locker.facility.name,
      latestReading: latest
        ? {
            temperature: latest.temperature,
            humidity: latest.humidity,
            vibration: latest.vibration,
            timestamp: latest.timestamp.toISOString(),
          }
        : null,
      thresholds: ADVISOR_ALERT_THRESHOLDS,
    };
  });
}

// ── getCCRList ──────────────────────────────────────────────────────────

export interface CCRSummary {
  certificateNumber: string;
  wineName: string;
  producer: string;
  vintage: number;
  monitoringStart: string;
  monitoringEnd: string;
  lockerName: string;
  dataIntegrityHash: string;
  verificationUrl: string;
  revoked: boolean;
}

/**
 * All Caveau Custody & Condition Reports issued for the member's wines.
 * The verificationUrl is absolute when NEXTAUTH_URL is set (production,
 * staging) and falls back to a relative `/verify/<hash>` path otherwise so
 * local dev still gets a clickable link.
 */
export async function getCCRList(): Promise<CCRSummary[]> {
  const session = await requireSession();
  const memberId = session.user.id;

  const certs = await prisma.provenanceCertificate.findMany({
    where: { wine: { memberId } },
    orderBy: { createdAt: "desc" },
    include: {
      wine: { select: { name: true, producer: true, vintage: true } },
      locker: {
        select: {
          lockerNumber: true,
          zone: true,
          facility: { select: { name: true } },
        },
      },
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";

  return certs.map((c) => ({
    certificateNumber: c.certificateNumber,
    wineName: c.wine.name,
    producer: c.wine.producer,
    vintage: c.wine.vintage,
    monitoringStart: c.monitoringStart.toISOString(),
    monitoringEnd: c.monitoringEnd.toISOString(),
    lockerName: `${c.locker.facility.name} — Locker #${c.locker.lockerNumber} (${c.locker.zone})`,
    dataIntegrityHash: c.dataIntegrityHash,
    verificationUrl: `${baseUrl}/verify/${c.dataIntegrityHash}`,
    revoked: c.revokedAt != null,
  }));
}

// ── getTierDetails ──────────────────────────────────────────────────────

export interface TierDetails {
  slug: string;
  name: string;
  description: string;
  priceMonthlyUsd: number | null;
  priceDisplay: string;
  hurricaneProtection: string;
  includedServices: string[];
}

/**
 * Resolves the public tier spec (Collector / Reserve / Private Vault /
 * Estate) for the session member. No DB query — the tier enum is on the
 * JWT, and the spec is a static table in src/lib/tiers.ts.
 */
export async function getTierDetails(): Promise<TierDetails> {
  const session = await requireSession();
  const spec = tierSpecForDbTier(session.user.tier);
  return {
    slug: spec.slug,
    name: spec.name,
    description: spec.description,
    priceMonthlyUsd: spec.priceMonthlyUsd,
    priceDisplay: spec.priceDisplay,
    hurricaneProtection: spec.hurricaneProtection,
    includedServices: [...spec.includedServices],
  };
}

// ── getWineDetail ───────────────────────────────────────────────────────

export interface WineValuationPoint {
  id: string;
  source: string;
  priceUsd: number;
  date: string;
}

export interface WineCCR {
  id: string;
  certificateNumber: string;
  monitoringStart: string;
  monitoringEnd: string;
  dataIntegrityHash: string;
  verificationUrl: string;
  revoked: boolean;
}

export interface WineDispositionRecord {
  id: string;
  type: string;
  date: string;
  salePriceUsd: number | null;
  recipient: string | null;
  notes: string | null;
}

export interface WineDetail {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  region: string;
  varietal: string;
  purchasePriceUsd: number;
  currentValueUsd: number;
  tastingNotes: string | null;
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  status: string;
  addedAt: string;
  lockerNumber: number | null;
  lockerZone: string | null;
  facilityName: string | null;
  valuations: WineValuationPoint[];
  certificates: WineCCR[];
  dispositions: WineDispositionRecord[];
  latestReading: {
    temperature: number;
    humidity: number;
    vibration: number;
    lightLux: number;
    timestamp: string;
  } | null;
}

/**
 * Full detail for a single wine the member owns. Pulls the most recent
 * 10 valuations across all sources, every CCR, every disposition entry,
 * and the latest sensor reading for the locker the bottle currently sits
 * in — enough context for the advisor to answer bottle-specific
 * questions without chaining a follow-up tool call.
 */
export async function getWineDetail(params: {
  wineId: string;
}): Promise<WineDetail> {
  const session = await requireSession();
  const memberId = session.user.id;
  const { wineId } = AdvisorWineIdParamSchema.parse(params);

  const wine = await prisma.wine.findFirst({
    where: { id: wineId, memberId },
    include: {
      lockerSlots: {
        include: {
          locker: {
            select: {
              id: true,
              lockerNumber: true,
              zone: true,
              facility: { select: { name: true } },
            },
          },
        },
      },
      valuations: {
        orderBy: { date: "desc" },
        take: 10,
      },
      certificates: true,
      dispositions: { orderBy: { date: "desc" } },
    },
  });

  if (!wine) {
    throw new Error("Wine not found");
  }

  const slot = wine.lockerSlots[0] ?? null;
  const baseUrl = process.env.NEXTAUTH_URL ?? "";

  let latestReading: WineDetail["latestReading"] = null;
  if (slot) {
    const reading = await prisma.sensorReading.findFirst({
      where: { lockerId: slot.locker.id },
      orderBy: { timestamp: "desc" },
    });
    if (reading) {
      latestReading = {
        temperature: toNumber(reading.temperature),
        humidity: toNumber(reading.humidity),
        vibration: toNumber(reading.vibration),
        lightLux: toNumber(reading.lightLux),
        timestamp: reading.timestamp.toISOString(),
      };
    }
  }

  return {
    id: wine.id,
    name: wine.name,
    producer: wine.producer,
    vintage: wine.vintage,
    region: wine.region,
    varietal: wine.varietal,
    purchasePriceUsd: toNumber(wine.purchasePrice),
    currentValueUsd: toNumber(wine.currentValue),
    tastingNotes: wine.tastingNotes,
    drinkWindowStart: wine.drinkWindowStart,
    drinkWindowEnd: wine.drinkWindowEnd,
    status: wine.status,
    addedAt: wine.createdAt.toISOString(),
    lockerNumber: slot?.locker.lockerNumber ?? null,
    lockerZone: slot?.locker.zone ?? null,
    facilityName: slot?.locker.facility.name ?? null,
    valuations: wine.valuations.map((v) => ({
      id: v.id,
      source: v.source,
      priceUsd: toNumber(v.price),
      date: v.date.toISOString(),
    })),
    certificates: wine.certificates.map((c) => ({
      id: c.id,
      certificateNumber: c.certificateNumber,
      monitoringStart: c.monitoringStart.toISOString(),
      monitoringEnd: c.monitoringEnd.toISOString(),
      dataIntegrityHash: c.dataIntegrityHash,
      verificationUrl: `${baseUrl}/verify/${c.dataIntegrityHash}`,
      revoked: c.revokedAt != null,
    })),
    dispositions: wine.dispositions.map((d) => ({
      id: d.id,
      type: d.type,
      date: d.date.toISOString(),
      salePriceUsd: d.salePrice != null ? toNumber(d.salePrice) : null,
      recipient: d.recipient,
      notes: d.notes,
    })),
    latestReading,
  };
}

// ── getLivexBenchmark ───────────────────────────────────────────────────

export interface LivexBenchmarkPoint {
  date: string;
  indexValue: number;
}

export interface LivexBenchmarkResult {
  points: LivexBenchmarkPoint[];
  latestValue: number | null;
  ytdChangePct: number | null;
  oneYearChangePct: number | null;
}

/**
 * Liv-ex Fine Wine 100 index history. Public data — not scoped by
 * member — but we still require an authenticated session to keep the
 * tool surface uniform (no shortcut for jailbreak prompts that rely on
 * one tool being "free").
 */
export async function getLivexBenchmark(
  params: { since?: Date | string } = {},
): Promise<LivexBenchmarkResult> {
  await requireSession();
  const parsed = AdvisorBenchmarkParamSchema.parse(params);

  const now = new Date();
  const defaultSince = new Date(now);
  defaultSince.setMonth(defaultSince.getMonth() - 24);
  const since = parsed.since ?? defaultSince;

  const rows = await prisma.livexBenchmark.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "asc" },
  });

  const points: LivexBenchmarkPoint[] = rows.map((r) => ({
    date: r.date.toISOString(),
    indexValue: toNumber(r.indexValue),
  }));

  if (points.length === 0) {
    return {
      points,
      latestValue: null,
      ytdChangePct: null,
      oneYearChangePct: null,
    };
  }

  const latestValue = points[points.length - 1]!.indexValue;

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const ytdAnchor = findClosestPointValue(points, startOfYear);
  const ytdChangePct =
    ytdAnchor != null ? percentChange(ytdAnchor, latestValue) : null;

  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAnchor = findClosestPointValue(points, oneYearAgo);
  const oneYearChangePct =
    oneYearAnchor != null ? percentChange(oneYearAnchor, latestValue) : null;

  return {
    points,
    latestValue,
    ytdChangePct,
    oneYearChangePct,
  };
}

function findClosestPointValue(
  points: LivexBenchmarkPoint[],
  target: Date,
): number | null {
  const first = points[0];
  if (!first) return null;
  const targetMs = target.getTime();
  let closest: LivexBenchmarkPoint = first;
  let closestDelta = Math.abs(new Date(first.date).getTime() - targetMs);
  for (const p of points) {
    const delta = Math.abs(new Date(p.date).getTime() - targetMs);
    if (delta < closestDelta) {
      closestDelta = delta;
      closest = p;
    }
  }
  return closest.indexValue;
}

// ── getPortfolioVsLivex ─────────────────────────────────────────────────

export interface PortfolioVsLivexSeriesPoint {
  date: string;
  label: string;
  portfolioUsd: number;
  portfolioIndexed: number;
  livexValue: number;
  livexIndexed: number;
}

export interface PortfolioVsLivexResult {
  windowType: "ytd" | "trailing_12m";
  anchorDate: string | null;
  asOf: string;
  portfolioChangePct: number | null;
  livexChangePct: number | null;
  deltaPct: number | null;
  points: PortfolioVsLivexSeriesPoint[];
}

/**
 * Portfolio performance vs the Liv-ex Fine Wine 100 over the YTD window
 * (or trailing 12 months when YTD is too short). Returns both series
 * indexed to 100 at the anchor so the advisor can answer slide-6 Q2
 * ("how am I doing vs the Liv-ex 100?") in one tool call — the
 * `deltaPct` field is the portfolio-minus-index edge in percentage
 * points, matching the dashboard and portfolio-page UI.
 *
 * Bottles added after the anchor are excluded so the baseline is
 * stable across the window (same math as the charts).
 */
export async function getPortfolioVsLivex(): Promise<PortfolioVsLivexResult> {
  const session = await requireSession();
  const memberId = session.user.id;

  const now = new Date();
  const eighteenMonthsAgo = new Date(
    now.getTime() - 18 * 30 * 24 * 60 * 60 * 1000,
  );

  const [wines, livexRows] = await Promise.all([
    prisma.wine.findMany({
      where: { memberId, status: "in_cellar" },
      select: {
        createdAt: true,
        purchasePrice: true,
        valuations: {
          orderBy: { date: "asc" },
          select: { date: true, price: true },
        },
      },
    }),
    prisma.livexBenchmark.findMany({
      where: { date: { gte: eighteenMonthsAgo } },
      orderBy: { date: "asc" },
      select: { date: true, indexValue: true },
    }),
  ]);

  const timeseriesWines: TimeseriesWine[] = wines.map((w) => ({
    createdAt: w.createdAt,
    purchasePrice: toNumber(w.purchasePrice),
    valuations: w.valuations.map((v) => ({
      date: v.date,
      price: toNumber(v.price),
    })),
  }));

  const series = buildPortfolioVsLivexSeries({
    wines: timeseriesWines,
    livexPoints: livexRows.map((p) => ({
      date: p.date,
      indexValue: toNumber(p.indexValue),
    })),
    now,
  });

  return {
    windowType: series.windowType,
    anchorDate: series.anchorDate,
    asOf: now.toISOString(),
    portfolioChangePct: series.portfolioChangePct,
    livexChangePct: series.livexChangePct,
    deltaPct: series.deltaPct,
    points: series.points.map((p) => ({
      date: p.date,
      label: p.label,
      portfolioUsd: Math.round(p.portfolioUsd),
      portfolioIndexed: p.portfolio,
      livexValue: p.livexValue,
      livexIndexed: p.livex,
    })),
  };
}

// ── getExitSignals ──────────────────────────────────────────────────────

export interface AdvisorExitSignal {
  id: string;
  wineId: string;
  wineName: string;
  producer: string;
  vintage: number;
  reason: "drink_window_closing" | "peak_momentum" | "dual";
  strength: "moderate" | "strong";
  rationale: string;
  priceSnapshotUsd: number;
  targetPriceLowUsd: number;
  targetPriceHighUsd: number;
  momentum12moPct: number | null;
  openedAt: string;
}

/**
 * All open exit signals across the member's collection. Feeds slide-6 Q1
 * ("what's my best exit opportunity right now?") — the advisor reads the
 * rationale + target range verbatim instead of inventing numbers. Closed
 * signals are excluded; the scoring pass in src/lib/exit-signals.ts is
 * the authoritative source for which signals are open.
 */
export async function getExitSignals(): Promise<AdvisorExitSignal[]> {
  const session = await requireSession();
  const memberId = session.user.id;

  const signals = await prisma.exitSignal.findMany({
    where: { memberId, closedAt: null },
    orderBy: [{ strength: "desc" }, { openedAt: "desc" }],
    include: {
      wine: {
        select: { id: true, name: true, producer: true, vintage: true },
      },
    },
  });

  return signals.map((s) => ({
    id: s.id,
    wineId: s.wine.id,
    wineName: s.wine.name,
    producer: s.wine.producer,
    vintage: s.wine.vintage,
    reason: s.reason,
    strength: s.strength,
    rationale: s.rationale,
    priceSnapshotUsd: toNumber(s.priceSnapshot),
    targetPriceLowUsd: toNumber(s.targetPriceLow),
    targetPriceHighUsd: toNumber(s.targetPriceHigh),
    momentum12moPct: s.momentum12moPct != null ? toNumber(s.momentum12moPct) : null,
    openedAt: s.openedAt.toISOString(),
  }));
}

// ── getInsuranceSavingsEstimate ─────────────────────────────────────────

export interface AdvisorInsuranceSavings {
  collectionValueUsd: number;
  tier: {
    slug: "collector" | "reserve" | "private_vault" | "estate";
    name: string;
  };
  savingsRangeUsd: { low: number; high: number };
  discountPct: { low: number; high: number };
  baselinePremiumUsd: { low: number; high: number };
  partners: readonly { name: string; focus: string }[];
  disciplineBullets: readonly string[];
}

/**
 * Static insurance savings estimate feeding slide 6 canonical Q4
 * ("how much am I saving on insurance?"). Sums the member's in-cellar
 * wine valuations, resolves their published tier, and hands the result
 * to `estimateInsuranceSavings` — same math as the dashboard card so
 * the advisor and the UI never disagree on the number.
 */
export async function getInsuranceSavingsEstimate(): Promise<AdvisorInsuranceSavings> {
  const session = await requireSession();
  const memberId = session.user.id;

  const [wineSum, member] = await Promise.all([
    prisma.wine.aggregate({
      where: { memberId, status: "in_cellar" },
      _sum: { currentValue: true },
    }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: { tier: true },
    }),
  ]);

  if (!member) throw new AdvisorAuthError();

  const collectionValueUsd = toNumber(wineSum._sum.currentValue ?? 0);
  const tierSpec = tierSpecForDbTier(member.tier);
  const estimate = estimateInsuranceSavings({
    collectionValueUsd,
    tier: tierSpec.slug,
  });

  return {
    collectionValueUsd,
    tier: { slug: tierSpec.slug, name: tierSpec.name },
    savingsRangeUsd: {
      low: estimate.savingsLowUsd,
      high: estimate.savingsHighUsd,
    },
    discountPct: {
      low: estimate.discountPctLow,
      high: estimate.discountPctHigh,
    },
    baselinePremiumUsd: {
      low: estimate.baselinePremiumLowUsd,
      high: estimate.baselinePremiumHighUsd,
    },
    partners: estimate.partners,
    disciplineBullets: estimate.disciplineBullets,
  };
}

// ── getMyAllocations (feature #60) ───────────────────────────────────────

export interface AdvisorAllocation {
  slug: string;
  producer: string;
  wineName: string;
  vintage: number;
  region: string;
  quantity: number;
  /** Bottles still available (not yet accepted or fulfilled). */
  remaining: number;
  pricePerBottleUsd: number;
  minimumTier: { slug: string; name: string };
  foundingOnly: boolean;
  foundingEarlyAccess: boolean;
  opensAt: string;
  closesAt: string;
  /** Eligibility outcome for the session member — null reason when eligible. */
  eligible: boolean;
  reason: string;
  /** Member's own request state on this allocation, if any. */
  myRequest: {
    status: string;
    quantityRequested: number;
    submittedAt: string;
  } | null;
}

export interface AdvisorAllocations {
  allocations: AdvisorAllocation[];
  /** Echoes the filter the model passed so it can reason about coverage. */
  filter: "eligible_open" | "requested" | "all";
}

/**
 * Return allocations visible to the session member for the given filter:
 *   - eligible_open (default): open + published + member is eligible
 *   - requested: any allocation the member has ever requested (any status)
 *   - all: every published/open allocation the member can see, even if
 *     below their tier floor (so the advisor can reason about ladder)
 *
 * `myRequest` reflects the most recent non-cancelled request per allocation.
 * Cancellations are hidden (treated as "not requested") so a cancelled
 * request doesn't persist in the advisor's view.
 */
export async function getMyAllocations(params: {
  status?: "eligible_open" | "requested" | "all";
}): Promise<AdvisorAllocations> {
  const session = await requireSession();
  const memberId = session.user.id;
  const filter = params.status ?? "eligible_open";

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) throw new AdvisorAuthError();

  const now = new Date();

  let allocations;
  if (filter === "requested") {
    allocations = await prisma.allocation.findMany({
      where: {
        requests: {
          some: {
            memberId,
            status: {
              not: AllocationRequestStatus.cancelled,
            },
          },
        },
      },
      include: {
        requests: {
          where: { memberId },
          select: {
            status: true,
            quantityRequested: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } else {
    allocations = await prisma.allocation.findMany({
      where: {
        status: AllocationStatus.published,
        closesAt: { gte: now },
      },
      include: {
        requests: {
          where: { memberId },
          select: {
            status: true,
            quantityRequested: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { opensAt: "asc" },
      take: 50,
    });
  }

  // Second query for the claimed-count math across all displayed rows.
  const allocationIds = allocations.map((a) => a.id);
  const claimedRows = allocationIds.length
    ? await prisma.allocationRequest.findMany({
        where: {
          allocationId: { in: allocationIds },
          status: {
            in: [
              AllocationRequestStatus.accepted,
              AllocationRequestStatus.fulfilled,
            ],
          },
        },
        select: { allocationId: true, quantityRequested: true, status: true },
      })
    : [];
  const claimedByAllocation = new Map<string, typeof claimedRows>();
  for (const row of claimedRows) {
    const arr = claimedByAllocation.get(row.allocationId) ?? [];
    arr.push(row);
    claimedByAllocation.set(row.allocationId, arr);
  }

  const results: AdvisorAllocation[] = allocations.map((a) => {
    const decision = decideEligibility(
      { tier: member.tier, foundingMember: member.foundingMember },
      a,
      now,
    );
    const claimed = claimedByAllocation.get(a.id) ?? [];
    const remaining = bottlesRemaining(a, claimed);
    const mine = a.requests[0];
    const tierSpec = tierSpecForDbTier(a.minimumTier);
    return {
      slug: a.slug,
      producer: a.producer,
      wineName: a.wineName,
      vintage: a.vintage,
      region: a.region,
      quantity: a.quantity,
      remaining,
      pricePerBottleUsd: toNumber(a.pricePerBottleUsd),
      minimumTier: { slug: tierSpec.slug, name: tierSpec.name },
      foundingOnly: a.foundingOnly,
      foundingEarlyAccess: a.foundingEarlyAccess,
      opensAt: a.opensAt.toISOString(),
      closesAt: a.closesAt.toISOString(),
      eligible: decision.eligible,
      reason: decision.reason,
      myRequest: mine
        ? {
            status: mine.status,
            quantityRequested: mine.quantityRequested,
            submittedAt: mine.createdAt.toISOString(),
          }
        : null,
    };
  });

  const filtered =
    filter === "eligible_open"
      ? results.filter((r) => r.eligible)
      : results;

  return { allocations: filtered, filter };
}

// ── getMyAppraisals (feature #61) ────────────────────────────────────────

export interface AdvisorAppraisal {
  id: string;
  appraisalNumber: string | null;
  status: "submitted" | "in_progress" | "completed" | "cancelled";
  purpose: "insurance" | "estate" | "tax_donation" | "divorce" | "gift" | "personal";
  basis: "fair_market_value" | "retail_replacement" | "auction_estimate";
  isWelcomeAppraisal: boolean;
  bottleCount: number | null;
  totalBasisUsd: number | null;
  priceChargedUsd: number | null;
  effectiveDate: string | null;
  createdAt: string;
  completedAt: string | null;
  revokedAt: string | null;
  /** When completed, a public `/verify/appraisal/<hash>` URL anyone can
   *  hit to confirm the document. Null for non-completed. */
  verifyUrl: string | null;
}

export interface AdvisorAppraisals {
  appraisals: AdvisorAppraisal[];
  /**
   * Founding welcome appraisal status for the session member:
   *   - "available": eligible and hasn't been requested/claimed yet
   *   - "claimed": already requested or completed
   *   - "ineligible": not a founding member
   */
  welcomeState: "available" | "claimed" | "ineligible";
  /** Price the member would pay for an additional (paid) appraisal. */
  paidPriceUsd: number;
  filter: "open" | "completed" | "all";
}

/**
 * Return the member's appraisal list. Default filter is `open` (submitted
 * or in_progress) because that's what the advisor is usually answering
 * about ("is my estate appraisal ready?"). `completed` returns issued
 * documents for reference; `all` returns everything including cancelled.
 *
 * `verifyUrl` is intentionally a relative path — the chat route doesn't
 * know the external origin, and every place we consume this value
 * (advisor response text, optional link-out) can prefix with the
 * canonical origin itself. Keeping it relative here avoids hard-coding
 * a host in the tool output.
 */
export async function getMyAppraisals(params: {
  status?: "open" | "completed" | "all";
}): Promise<AdvisorAppraisals> {
  const session = await requireSession();
  const memberId = session.user.id;
  const filter = params.status ?? "open";

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) throw new AdvisorAuthError();

  const where = (() => {
    if (filter === "completed") {
      return { memberId, status: AppraisalStatus.completed };
    }
    if (filter === "open") {
      return {
        memberId,
        status: {
          in: [AppraisalStatus.submitted, AppraisalStatus.in_progress],
        },
      };
    }
    return { memberId };
  })();

  const [appraisals, welcome] = await Promise.all([
    prisma.appraisal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    checkWelcomeEligibility(memberId, member.foundingMember),
  ]);

  const welcomeState: AdvisorAppraisals["welcomeState"] = !member.foundingMember
    ? "ineligible"
    : welcome.existing
      ? "claimed"
      : "available";

  const paidPrice = resolveAppraisalPrice(member.tier, false);

  return {
    appraisals: appraisals.map((a) => ({
      id: a.id,
      appraisalNumber: a.appraisalNumber,
      status: a.status,
      purpose: a.purpose,
      basis: a.basis,
      isWelcomeAppraisal: a.isWelcomeAppraisal,
      bottleCount: a.bottleCount,
      totalBasisUsd: a.totalBasisUsd ? toNumber(a.totalBasisUsd) : null,
      priceChargedUsd: a.priceChargedUsd ? toNumber(a.priceChargedUsd) : null,
      effectiveDate: a.effectiveDate?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
      revokedAt: a.revokedAt?.toISOString() ?? null,
      verifyUrl:
        a.status === AppraisalStatus.completed &&
        a.dataIntegrityHash &&
        !a.revokedAt
          ? `/verify/appraisal/${a.dataIntegrityHash}`
          : null,
    })),
    welcomeState,
    paidPriceUsd: paidPrice.priceUsd,
    filter,
  };
}

// ── getMyAcquisitions (feature #62) ──────────────────────────────────────

export interface AdvisorAcquisition {
  id: string;
  status: "requested" | "sourcing" | "fulfilled" | "declined" | "cancelled";
  /** Human-readable one-line spec ("2010 Château Lafite Rothschild × 1"). */
  spec: string;
  producer: string;
  wineName: string | null;
  vintageExact: number | null;
  vintageMin: number | null;
  vintageMax: number | null;
  region: string | null;
  varietal: string | null;
  quantity: number;
  maxBudgetUsd: number | null;
  memberNote: string | null;
  /** Visible to the member — the staff note is used for sourcing
   *  communication (quote caveats, ETA, etc). */
  sourcingNote: string | null;
  /** Working-quote total the staff shared at the sourcing stage. Null
   *  if not yet quoted. */
  estimatedTotalUsd: number | null;
  /** Final member-facing price once fulfilled. Null until fulfillment. */
  memberPriceUsd: number | null;
  source: "livex" | "broker" | "auction" | "caveau_private" | null;
  /** Wine IDs written into the member's collection on fulfillment. */
  sourcedWineIds: string[];
  createdAt: string;
  fulfilledAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
}

export interface AdvisorAcquisitions {
  acquisitions: AdvisorAcquisition[];
  filter: "open" | "fulfilled" | "all";
}

/**
 * Return the member's acquisition sourcing requests (feature #62).
 *
 * Filter values:
 *   - open (default): `requested` + `sourcing` — the slice the advisor
 *     is usually answering about ("what's the status on my Margaux?")
 *   - fulfilled: completed sourcing that's in the cellar
 *   - all: everything including declined and cancelled
 *
 * Deliberately excludes `actualCostUsd` and `marginUsd` — slide 15's
 * 8–12% margin is an operator reporting handle, not a member-facing
 * disclosure. An advisor running in member context should not leak
 * Caveau's cost basis even if the member asks "what did you pay for
 * it?". If the member needs the cost, that's an admin-side answer.
 */
export async function getMyAcquisitions(params: {
  status?: "open" | "fulfilled" | "all";
}): Promise<AdvisorAcquisitions> {
  const session = await requireSession();
  const memberId = session.user.id;
  const filter = params.status ?? "open";

  const where = (() => {
    if (filter === "fulfilled") {
      return { memberId, status: AcquisitionStatus.fulfilled };
    }
    if (filter === "open") {
      return {
        memberId,
        status: {
          in: [AcquisitionStatus.requested, AcquisitionStatus.sourcing],
        },
      };
    }
    return { memberId };
  })();

  const acquisitions = await prisma.acquisition.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      sourcedWines: { select: { id: true } },
    },
    take: 50,
  });

  return {
    acquisitions: acquisitions.map((a) => ({
      id: a.id,
      status: a.status,
      spec: formatAcquisitionSpec(a),
      producer: a.producer,
      wineName: a.wineName,
      vintageExact: a.vintageExact,
      vintageMin: a.vintageMin,
      vintageMax: a.vintageMax,
      region: a.region,
      varietal: a.varietal,
      quantity: a.quantity,
      maxBudgetUsd: a.maxBudgetUsd ? toNumber(a.maxBudgetUsd) : null,
      memberNote: a.memberNote,
      sourcingNote: a.staffNote,
      estimatedTotalUsd: a.estimatedTotalUsd
        ? toNumber(a.estimatedTotalUsd)
        : null,
      memberPriceUsd: a.memberPriceUsd ? toNumber(a.memberPriceUsd) : null,
      source: a.source,
      sourcedWineIds: a.sourcedWines.map((w) => w.id),
      createdAt: a.createdAt.toISOString(),
      fulfilledAt: a.fulfilledAt?.toISOString() ?? null,
      declinedAt: a.declinedAt?.toISOString() ?? null,
      cancelledAt: a.cancelledAt?.toISOString() ?? null,
    })),
    filter,
  };
}

// ── getMyExits (feature #47) ─────────────────────────────────────────────

export interface AdvisorExit {
  id: string;
  status: "requested" | "listed" | "sold" | "withdrawn" | "cancelled";
  /** Member-facing status copy ("In review", "Listed", "Sold", ...) */
  memberStatus: string;
  wineId: string;
  /** Formatted as "2010 Château Lafite Rothschild — Pauillac". */
  wineSummary: string;
  channel: "auction" | "broker" | "private_sale" | "self_handled" | null;
  /** Named auction house ("Sotheby's") when channel=auction. Null otherwise. */
  auctionHouseName: string | null;
  /** One-line human channel description — e.g. "Auction · Sotheby's". */
  channelSummary: string;
  listedPriceUsd: number | null;
  /** Gross proceeds — member sees the top-line number. */
  grossProceedsUsd: number | null;
  /** Net after commission — the member's actual take. */
  netProceedsUsd: number | null;
  /** Member-authored target range at request time. */
  targetPriceLowUsd: number | null;
  targetPriceHighUsd: number | null;
  /** Staff note (visible to member — used for listing / closing comms). */
  staffNote: string | null;
  /** Reason the listing was pulled — surfaced verbatim to the member
   *  on withdrawn rows. */
  withdrawnReason: string | null;
  createdAt: string;
  listedAt: string | null;
  soldAt: string | null;
  withdrawnAt: string | null;
  cancelledAt: string | null;
}

export interface AdvisorExits {
  exits: AdvisorExit[];
  filter: "open" | "closed" | "all";
}

/**
 * Return the member's exit facilitations (feature #47).
 *
 * Filter values:
 *   - open (default): `requested` + `listed` — the slice the advisor
 *     is usually answering about ("what's happening with my Opus One sale?")
 *   - closed: terminal rows (sold / withdrawn / cancelled)
 *   - all: everything
 *
 * Deliberately excludes `commissionPct` and `commissionUsd` — slide 5
 * mentions the 10–12% commission as the operator's revenue handle, not
 * a member-facing disclosure. An advisor running in member context
 * should not leak Caveau's cut even when asked directly. Members see
 * gross and net; if they ask "what's Caveau's cut?", the advisor
 * declines with "that's an operator-side figure" — same contract as
 * the #62 acquisitions margin withholding.
 */
export async function getMyExits(params: {
  status?: "open" | "closed" | "all";
}): Promise<AdvisorExits> {
  const session = await requireSession();
  const memberId = session.user.id;
  const filter = params.status ?? "open";

  const where = (() => {
    if (filter === "open") {
      return {
        memberId,
        status: { in: [ExitStatus.requested, ExitStatus.listed] },
      };
    }
    if (filter === "closed") {
      return {
        memberId,
        status: {
          in: [ExitStatus.sold, ExitStatus.withdrawn, ExitStatus.cancelled],
        },
      };
    }
    return { memberId };
  })();

  const exits = await prisma.exitFacilitation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      wine: {
        select: { id: true, name: true, producer: true, vintage: true, region: true },
      },
    },
    take: 50,
  });

  return {
    exits: exits.map((e) => ({
      id: e.id,
      status: e.status,
      memberStatus: MEMBER_STATUS_COPY[e.status],
      wineId: e.wine.id,
      wineSummary: `${e.wine.vintage} ${e.wine.producer} ${e.wine.name} — ${e.wine.region}`,
      channel: e.channel,
      auctionHouseName: e.auctionHouseName,
      channelSummary: formatChannelWithHouse({
        channel: e.channel,
        auctionHouseName: e.auctionHouseName,
      }),
      listedPriceUsd: e.listedPriceUsd ? toNumber(e.listedPriceUsd) : null,
      grossProceedsUsd: e.grossProceedsUsd
        ? toNumber(e.grossProceedsUsd)
        : null,
      netProceedsUsd: e.netProceedsUsd ? toNumber(e.netProceedsUsd) : null,
      // NOTE: commissionPct + commissionUsd intentionally absent — see
      // comment on the getMyExits JSDoc for the contract.
      targetPriceLowUsd: e.targetPriceLow ? toNumber(e.targetPriceLow) : null,
      targetPriceHighUsd: e.targetPriceHigh
        ? toNumber(e.targetPriceHigh)
        : null,
      staffNote: e.staffNote,
      withdrawnReason: e.withdrawnReason,
      createdAt: e.createdAt.toISOString(),
      listedAt: e.listedAt?.toISOString() ?? null,
      soldAt: e.soldAt?.toISOString() ?? null,
      withdrawnAt: e.withdrawnAt?.toISOString() ?? null,
      cancelledAt: e.cancelledAt?.toISOString() ?? null,
    })),
    filter,
  };
}
