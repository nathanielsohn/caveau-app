/**
 * Portfolio-vs-Liv-ex-100 timeseries (feature #57).
 *
 * Reconstructs portfolio value at each Liv-ex monthly snapshot date
 * from per-bottle `WineValuation` history, then indexes both series to
 * 100 at the anchor so the chart reads as a clean "who's winning YTD"
 * comparison rather than a mixed-units dual-axis.
 *
 * Bottles acquired after the anchor date are excluded (Option A) —
 * a bottle added in February doesn't retroactively inflate the Jan 1
 * baseline. This keeps the math defensible; the tradeoff is that
 * mid-year additions don't contribute until the next window.
 *
 * YTD fallback: when the current year has fewer than
 * MIN_YTD_POINTS Liv-ex snapshots available, we draw a trailing-12-month
 * window instead so the chart isn't one or two lonely points in early
 * January.
 */

export interface TimeseriesWine {
  createdAt: Date;
  purchasePrice: number;
  valuations: Array<{ date: Date; price: number }>;
}

export interface LivexPoint {
  date: Date;
  indexValue: number;
}

export interface PortfolioVsLivexPoint {
  /** ISO snapshot date. */
  date: string;
  /** Chart x-axis label ("Jan", "Feb", ...). */
  label: string;
  /** Portfolio value on this date, USD (absolute). */
  portfolioUsd: number;
  /** Liv-ex index value on this date (absolute, no unit). */
  livexValue: number;
  /** Portfolio indexed to 100 at the anchor date. */
  portfolio: number;
  /** Liv-ex indexed to 100 at the anchor date. */
  livex: number;
}

export interface PortfolioVsLivexSeries {
  points: PortfolioVsLivexPoint[];
  /** Anchor date the series is indexed against (ISO). Null when empty. */
  anchorDate: string | null;
  /** "ytd" when the current year has >= MIN_YTD_POINTS Liv-ex points;
   *  "trailing_12m" otherwise. */
  windowType: "ytd" | "trailing_12m";
  /** Portfolio % change, latest vs anchor. */
  portfolioChangePct: number | null;
  /** Liv-ex % change, latest vs anchor. */
  livexChangePct: number | null;
  /** Portfolio − Liv-ex, in percentage points. */
  deltaPct: number | null;
}

// Minimum YTD Liv-ex points before we commit to a YTD window. Below
// this, we fall back to trailing 12 months so the chart has enough
// data to read as a trend rather than a single dot.
export const MIN_YTD_POINTS = 3;

/**
 * Portfolio value on `date` = sum over bottles of the nearest-preceding
 * valuation (or purchase price when the bottle has no earlier
 * valuations). Bottles acquired after `date` are skipped.
 */
export function computePortfolioValueAt(
  wines: TimeseriesWine[],
  date: Date,
): number {
  let total = 0;
  const dateMs = date.getTime();
  for (const w of wines) {
    if (w.createdAt.getTime() > dateMs) continue;
    let priceAt: number | null = null;
    let priceDateMs = -Infinity;
    for (const v of w.valuations) {
      const t = v.date.getTime();
      if (t > dateMs) continue;
      if (t > priceDateMs) {
        priceDateMs = t;
        priceAt = v.price;
      }
    }
    total += priceAt ?? w.purchasePrice;
  }
  return total;
}

/**
 * Build the chart-ready portfolio + Liv-ex indexed series.
 *
 * Sampling dates come from `livexPoints` so the two lines always land
 * on the same x-axis ticks. Returns an empty series (no points) when
 * there's no Liv-ex data, no bottles held at the anchor, or the
 * portfolio's anchor value is zero.
 */
export function buildPortfolioVsLivexSeries({
  wines,
  livexPoints,
  now,
}: {
  wines: TimeseriesWine[];
  livexPoints: LivexPoint[];
  now: Date;
}): PortfolioVsLivexSeries {
  if (livexPoints.length === 0) return emptySeries();

  const nowMs = now.getTime();
  const currentYear = now.getUTCFullYear();
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));

  // Sort once; filter into YTD and trailing-12m subsets.
  const sorted = [...livexPoints]
    .filter((p) => p.date.getTime() <= nowMs)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const ytdLivex = sorted.filter(
    (p) => p.date.getTime() >= yearStart.getTime(),
  );

  let windowType: "ytd" | "trailing_12m";
  let sampleLivex: LivexPoint[];
  if (ytdLivex.length >= MIN_YTD_POINTS) {
    windowType = "ytd";
    sampleLivex = ytdLivex;
  } else {
    windowType = "trailing_12m";
    const trailingStart = new Date(now);
    trailingStart.setUTCFullYear(trailingStart.getUTCFullYear() - 1);
    sampleLivex = sorted.filter(
      (p) => p.date.getTime() >= trailingStart.getTime(),
    );
  }

  if (sampleLivex.length < 2) return emptySeries();

  const anchor = sampleLivex[0]!;
  // Option A: only bottles held at the anchor contribute. Keeps the
  // baseline defensible and means both sides of the comparison cover
  // the same bottles across the window.
  const heldAtAnchor = wines.filter(
    (w) => w.createdAt.getTime() <= anchor.date.getTime(),
  );

  const portfolioAnchor = computePortfolioValueAt(heldAtAnchor, anchor.date);
  if (portfolioAnchor <= 0) return emptySeries();

  const livexAnchor = anchor.indexValue;
  if (livexAnchor <= 0) return emptySeries();

  // Label format: plain month in YTD ("Jan", "Feb"); month + 2-digit
  // year in trailing-12m so repeating months are disambiguated.
  const labelFor = (d: Date) =>
    windowType === "ytd"
      ? d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
      : d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        });

  const points: PortfolioVsLivexPoint[] = sampleLivex.map((lp) => {
    const portfolioUsd = computePortfolioValueAt(heldAtAnchor, lp.date);
    return {
      date: lp.date.toISOString(),
      label: labelFor(lp.date),
      portfolioUsd,
      livexValue: lp.indexValue,
      portfolio: round2((portfolioUsd / portfolioAnchor) * 100),
      livex: round2((lp.indexValue / livexAnchor) * 100),
    };
  });

  const last = points[points.length - 1]!;
  const portfolioChangePct = round2(last.portfolio - 100);
  const livexChangePct = round2(last.livex - 100);
  const deltaPct = round2(portfolioChangePct - livexChangePct);

  return {
    points,
    anchorDate: anchor.date.toISOString(),
    windowType,
    portfolioChangePct,
    livexChangePct,
    deltaPct,
  };
}

function emptySeries(): PortfolioVsLivexSeries {
  return {
    points: [],
    anchorDate: null,
    windowType: "ytd",
    portfolioChangePct: null,
    livexChangePct: null,
    deltaPct: null,
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
