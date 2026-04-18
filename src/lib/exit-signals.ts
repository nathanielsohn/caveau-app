/**
 * Exit signal scoring + reconciliation (feature #55).
 *
 * An exit signal is the app's "maybe consider selling this" flag per bottle.
 * It opens when a wine is either (a) within five years of its drink-window
 * end or (b) up ≥ 12% on the market over 12 months, and closes when the
 * bottle leaves the collection or the scoring pass no longer trips. The
 * logic here is the single source of truth for both the dashboard card and
 * the AI Advisor's `getExitSignals` tool so the two never disagree.
 *
 * The scoring is deterministic and idempotent — `reconcileMemberExitSignals`
 * runs in seed, and could run on a cron later without double-counting.
 * We cap at one open signal per wine at any time; a partial unique index
 * in migration 0034 enforces that at the DB level.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Demo-tuned thresholds. "Peak momentum moderate" at +12% gives Rob's
// portfolio a handful of meaningful signals without spamming every wine
// that appreciated a bit. "Strong" at +22% picks up the trophies that have
// actually run hard over the last year. See the seed valuation curve in
// prisma/seed.ts §8 — most wines come out at (current - basis)/basis * 100
// because the curve interpolates smoothly from purchase to current.
const MOMENTUM_MODERATE_PCT = 12;
const MOMENTUM_STRONG_PCT = 22;

// Drink-window reason. "Strong" is the last year or past peak; "moderate"
// is within five years of end. Wines whose drink window hasn't yet opened
// are never flagged — aging-under-window is not an exit signal.
const DRINK_WINDOW_MODERATE_YEARS = 5;
const DRINK_WINDOW_STRONG_YEARS = 1;

export type ExitSignalReason =
  | "drink_window_closing"
  | "peak_momentum"
  | "dual";
export type ExitSignalStrength = "moderate" | "strong";

export interface ExitSignalInput {
  drinkWindowStart: number | null;
  drinkWindowEnd: number | null;
  currentValue: number;
  /** Ordered ascending by date. Any source — we don't filter on Liv-ex
   *  specifically because the seed valuation curve cycles sources and
   *  trophy wines may lack a dense Liv-ex series. */
  valuations: { date: Date; price: number }[];
  /** Usually `new Date()`. Overridable for deterministic tests. */
  now?: Date;
}

export interface ExitSignalDraft {
  reason: ExitSignalReason;
  strength: ExitSignalStrength;
  rationale: string;
  priceSnapshot: number;
  targetPriceLow: number;
  targetPriceHigh: number;
  /** Null when we couldn't anchor a 12-month window (fewer than two
   *  valuations, or the oldest is within the last 90 days). */
  momentum12moPct: number | null;
}

/**
 * Score a single wine. Returns null when no signal applies.
 */
export function scoreWineForExit(input: ExitSignalInput): ExitSignalDraft | null {
  const now = input.now ?? new Date();
  const year = now.getUTCFullYear();

  // ── Drink-window leg ─────────────────────────────────────────────────
  let drinkLeg: ExitSignalStrength | null = null;
  const { drinkWindowStart, drinkWindowEnd } = input;
  if (drinkWindowEnd != null) {
    const inWindow =
      drinkWindowStart == null || year >= drinkWindowStart;
    const yearsToEnd = drinkWindowEnd - year;
    if (inWindow && yearsToEnd <= DRINK_WINDOW_STRONG_YEARS) {
      drinkLeg = "strong";
    } else if (inWindow && yearsToEnd <= DRINK_WINDOW_MODERATE_YEARS) {
      drinkLeg = "moderate";
    }
  }

  // ── Momentum leg ─────────────────────────────────────────────────────
  const momentumPct = computeTwelveMonthMomentum({
    valuations: input.valuations,
    currentValue: input.currentValue,
    now,
  });

  let momentumLeg: ExitSignalStrength | null = null;
  if (momentumPct != null) {
    if (momentumPct >= MOMENTUM_STRONG_PCT) momentumLeg = "strong";
    else if (momentumPct >= MOMENTUM_MODERATE_PCT) momentumLeg = "moderate";
  }

  if (!drinkLeg && !momentumLeg) return null;

  // ── Combine ──────────────────────────────────────────────────────────
  let reason: ExitSignalReason;
  let strength: ExitSignalStrength;
  if (drinkLeg && momentumLeg) {
    reason = "dual";
    strength =
      drinkLeg === "strong" || momentumLeg === "strong" ? "strong" : "moderate";
  } else if (drinkLeg) {
    reason = "drink_window_closing";
    strength = drinkLeg;
  } else {
    reason = "peak_momentum";
    strength = momentumLeg!;
  }

  const priceSnapshot = input.currentValue;
  // Target range frames a consignment ask: moderate signals are "hold
  // the line on current value", strong signals price in a premium for
  // the urgency or momentum.
  const [lowMult, highMult] =
    strength === "strong" ? [1.05, 1.2] : [1.0, 1.1];
  const targetPriceLow = round2(priceSnapshot * lowMult);
  const targetPriceHigh = round2(priceSnapshot * highMult);

  return {
    reason,
    strength,
    rationale: buildRationale({
      reason,
      strength,
      drinkWindowEnd,
      currentYear: year,
      momentumPct,
    }),
    priceSnapshot,
    targetPriceLow,
    targetPriceHigh,
    momentum12moPct: momentumPct,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 12-month price change as a percentage. Uses `currentValue` as the
 * "now" anchor and the valuation closest to (now - 365d) as the "then"
 * anchor. Returns null when we have no pre-90-day valuation to compare
 * against — a recently-added wine has no momentum signal.
 */
function computeTwelveMonthMomentum(params: {
  valuations: { date: Date; price: number }[];
  currentValue: number;
  now: Date;
}): number | null {
  const { valuations, currentValue, now } = params;
  if (valuations.length === 0) return null;

  const oneYearAgo = new Date(now.getTime() - 365 * MS_PER_DAY);
  const minAnchorAge = new Date(now.getTime() - 90 * MS_PER_DAY);

  // Find the valuation closest to one year ago, but require it to be
  // older than 90 days — otherwise the "then" and "now" anchors are the
  // same slice of time and the pct change is noise.
  let anchor: { date: Date; price: number } | null = null;
  let anchorDelta = Infinity;
  for (const v of valuations) {
    if (v.date > minAnchorAge) continue;
    const delta = Math.abs(v.date.getTime() - oneYearAgo.getTime());
    if (delta < anchorDelta) {
      anchorDelta = delta;
      anchor = v;
    }
  }
  if (!anchor || anchor.price <= 0) return null;

  return ((currentValue - anchor.price) / anchor.price) * 100;
}

function buildRationale(params: {
  reason: ExitSignalReason;
  strength: ExitSignalStrength;
  drinkWindowEnd: number | null;
  currentYear: number;
  momentumPct: number | null;
}): string {
  const { reason, strength, drinkWindowEnd, currentYear, momentumPct } = params;
  const momentumText =
    momentumPct != null
      ? `market is ${momentumPct >= 0 ? "+" : ""}${momentumPct.toFixed(1)}% over 12 months`
      : "market remains firm";
  const yearsToEnd =
    drinkWindowEnd != null ? drinkWindowEnd - currentYear : null;

  if (reason === "drink_window_closing" && strength === "strong") {
    return `Drink window closes in ${drinkWindowEnd ?? "—"} — consign in the next 90 days to beat a post-peak auction.`;
  }
  if (reason === "drink_window_closing" && strength === "moderate") {
    return `Drink window narrows to ${drinkWindowEnd ?? "—"} (${yearsToEnd ?? "—"} yrs) while ${momentumText}. Measured exit window.`;
  }
  if (reason === "peak_momentum" && strength === "strong") {
    return `Liv-ex ${momentumText}, notably outpacing the Liv-ex 100. Strong window to consign a portion.`;
  }
  if (reason === "peak_momentum" && strength === "moderate") {
    return `Liv-ex ${momentumText}. Consider locking part of the gain while the print holds.`;
  }
  // dual
  if (strength === "strong") {
    return `Drink window ends ${drinkWindowEnd ?? "—"} and ${momentumText}. Both catalysts point to consigning now.`;
  }
  return `Drink window narrows to ${drinkWindowEnd ?? "—"} and ${momentumText}. Measured consign window.`;
}

// ── Reconciliation against the DB ──────────────────────────────────────

/**
 * Run the scoring pass for every in-cellar wine the member owns, opening
 * new signals, closing stale ones, and updating the handful whose
 * strength / target range moved. Returns a small summary so the seed
 * script can print something useful.
 */
export async function reconcileMemberExitSignals(
  memberId: string,
  now: Date = new Date(),
): Promise<{
  opened: number;
  updated: number;
  closed: number;
}> {
  const wines = await prisma.wine.findMany({
    where: { memberId },
    select: {
      id: true,
      status: true,
      currentValue: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      valuations: {
        orderBy: { date: "asc" },
        select: { date: true, price: true },
      },
    },
  });

  const openSignals = await prisma.exitSignal.findMany({
    where: { memberId, closedAt: null },
  });
  const openByWine = new Map(openSignals.map((s) => [s.wineId, s]));

  let opened = 0;
  let updated = 0;
  let closed = 0;

  for (const wine of wines) {
    const existing = openByWine.get(wine.id);

    // A wine that left the collection closes any open signal regardless
    // of scoring — the signal exists to prompt a sale, and that moment
    // has either happened or been deferred.
    if (wine.status !== "in_cellar") {
      if (existing) {
        await prisma.exitSignal.update({
          where: { id: existing.id },
          data: { closedAt: now, closedReason: "disposed" },
        });
        closed++;
      }
      continue;
    }

    const draft = scoreWineForExit({
      drinkWindowStart: wine.drinkWindowStart,
      drinkWindowEnd: wine.drinkWindowEnd,
      currentValue: toNumber(wine.currentValue),
      valuations: wine.valuations.map((v) => ({
        date: v.date,
        price: toNumber(v.price),
      })),
      now,
    });

    if (!draft) {
      if (existing) {
        await prisma.exitSignal.update({
          where: { id: existing.id },
          data: { closedAt: now, closedReason: "expired" },
        });
        closed++;
      }
      continue;
    }

    if (!existing) {
      await prisma.exitSignal.create({
        data: {
          wineId: wine.id,
          memberId,
          reason: draft.reason,
          strength: draft.strength,
          rationale: draft.rationale,
          priceSnapshot: new Prisma.Decimal(draft.priceSnapshot),
          targetPriceLow: new Prisma.Decimal(draft.targetPriceLow),
          targetPriceHigh: new Prisma.Decimal(draft.targetPriceHigh),
          momentum12moPct:
            draft.momentum12moPct != null
              ? new Prisma.Decimal(round2(draft.momentum12moPct))
              : null,
          openedAt: now,
        },
      });
      opened++;
      continue;
    }

    // Update in place only when something meaningful moved. Rewriting
    // every row every pass would churn `updatedAt` and invalidate any
    // future caching.
    const momentumRounded =
      draft.momentum12moPct != null ? round2(draft.momentum12moPct) : null;
    const existingMomentum =
      existing.momentum12moPct != null ? toNumber(existing.momentum12moPct) : null;
    const driftedMomentum =
      (existingMomentum == null) !== (momentumRounded == null) ||
      (existingMomentum != null &&
        momentumRounded != null &&
        Math.abs(existingMomentum - momentumRounded) >= 0.5);

    const driftedNumeric =
      Math.abs(toNumber(existing.priceSnapshot) - draft.priceSnapshot) >= 0.01 ||
      Math.abs(toNumber(existing.targetPriceLow) - draft.targetPriceLow) >= 0.01 ||
      Math.abs(toNumber(existing.targetPriceHigh) - draft.targetPriceHigh) >= 0.01;

    if (
      existing.reason !== draft.reason ||
      existing.strength !== draft.strength ||
      existing.rationale !== draft.rationale ||
      driftedMomentum ||
      driftedNumeric
    ) {
      await prisma.exitSignal.update({
        where: { id: existing.id },
        data: {
          reason: draft.reason,
          strength: draft.strength,
          rationale: draft.rationale,
          priceSnapshot: new Prisma.Decimal(draft.priceSnapshot),
          targetPriceLow: new Prisma.Decimal(draft.targetPriceLow),
          targetPriceHigh: new Prisma.Decimal(draft.targetPriceHigh),
          momentum12moPct:
            momentumRounded != null ? new Prisma.Decimal(momentumRounded) : null,
        },
      });
      updated++;
    }
  }

  return { opened, updated, closed };
}

// ── Display helpers ─────────────────────────────────────────────────────

const REASON_LABEL: Record<ExitSignalReason, string> = {
  drink_window_closing: "Drink window closing",
  peak_momentum: "Peak momentum",
  dual: "Drink window + momentum",
};

export function reasonLabel(reason: ExitSignalReason): string {
  return REASON_LABEL[reason];
}

export function strengthBadgeClass(strength: ExitSignalStrength): string {
  return strength === "strong"
    ? "bg-gold/10 text-gold border-gold/30"
    : "bg-burgundy/10 text-burgundy border-burgundy/30";
}
