/**
 * Investment portfolio helpers (feature #45).
 *
 * Tier classification, CAGR math, and projections for the per-bottle
 * investment view. Sourced from Robert Saenz's April 2026 10-Bottle
 * portfolio PDF — the six tier labels (Anchor / Icon / Blue-Chip /
 * Prestige / Accessible / Approachable) are how investors slot trophy
 * bottles by role in a collection, not by raw price. Kept as a
 * hardcoded classifier (rather than a DB column) so adding #45 doesn't
 * collide with other parallel feature migrations.
 */

export type InvestmentTier =
  | "anchor"
  | "icon"
  | "blue-chip"
  | "prestige"
  | "accessible"
  | "approachable";

export interface WineIdentity {
  producer: string;
  name: string;
  vintage: number;
}

interface TierRule {
  match: (w: WineIdentity) => boolean;
  tier: InvestmentTier;
}

// Order matters only insofar as the first match wins. Rules are keyed on
// producer + name so label scanning or manual entry with slight variance
// still classifies correctly.
const TIER_RULES: TierRule[] = [
  { match: (w) => w.producer === "Pétrus", tier: "icon" },
  { match: (w) => w.producer === "Screaming Eagle", tier: "icon" },
  { match: (w) => w.producer === "Harlan Estate", tier: "anchor" },
  {
    match: (w) => w.producer === "Château Latour",
    tier: "anchor",
  },
  { match: (w) => w.producer === "Masseto", tier: "blue-chip" },
  {
    match: (w) => w.producer === "Domaine de la Romanée-Conti",
    tier: "blue-chip",
  },
  { match: (w) => w.producer === "Château Palmer", tier: "prestige" },
  { match: (w) => w.producer === "Opus One Winery", tier: "prestige" },
  {
    match: (w) =>
      w.producer === "Ridge Vineyards" && /Monte Bello/i.test(w.name),
    tier: "accessible",
  },
  {
    match: (w) =>
      w.producer === "Caymus Vineyards" && /Special Selection/i.test(w.name),
    tier: "approachable",
  },
];

export function classifyInvestmentTier(
  wine: WineIdentity,
): InvestmentTier | null {
  for (const rule of TIER_RULES) {
    if (rule.match(wine)) return rule.tier;
  }
  return null;
}

// Display metadata for each tier — kept together so a new tier label only
// needs one edit. The order is the canonical "strongest → gateway" order
// used in the portfolio breakdown tables.
export const TIER_ORDER: InvestmentTier[] = [
  "icon",
  "anchor",
  "blue-chip",
  "prestige",
  "accessible",
  "approachable",
];

export function tierLabel(tier: InvestmentTier): string {
  switch (tier) {
    case "icon":
      return "Icon";
    case "anchor":
      return "Anchor";
    case "blue-chip":
      return "Blue-Chip";
    case "prestige":
      return "Prestige";
    case "accessible":
      return "Accessible";
    case "approachable":
      return "Approachable";
  }
}

export function tierDescription(tier: InvestmentTier): string {
  switch (tier) {
    case "icon":
      return "Trophy bottle — highest rarity and cultural weight.";
    case "anchor":
      return "Portfolio compounder — reliable long-run appreciation.";
    case "blue-chip":
      return "Mid-cap appreciator — recognized globally, room to grow.";
    case "prestige":
      return "Accessible trophy — instant name recognition.";
    case "accessible":
      return "Value per score — best return on critical acclaim.";
    case "approachable":
      return "Gateway bottle — bridges the investment conversation.";
  }
}

// Tailwind class pair for tier badges. Uses existing Caveau palette
// (gold / burgundy / warm neutrals) so nothing new lands in globals.css.
export function tierBadgeClass(tier: InvestmentTier): string {
  switch (tier) {
    case "icon":
      return "bg-gold/20 text-gold border-gold/30";
    case "anchor":
      return "bg-burgundy/20 text-[#E38DA1] border-burgundy/30";
    case "blue-chip":
      return "bg-[#5B8DEF]/15 text-[#8AAEF0] border-[#5B8DEF]/30";
    case "prestige":
      return "bg-[#D9A25B]/15 text-[#E3B577] border-[#D9A25B]/30";
    case "accessible":
      return "bg-[#6BB38F]/15 text-[#8FCBA8] border-[#6BB38F]/30";
    case "approachable":
      return "bg-[#8B8B96]/15 text-secondary border-[#8B8B96]/30";
  }
}

// ── Math ─────────────────────────────────────────────────────────────

/**
 * Compound Annual Growth Rate between two price points.
 * Returns a decimal (e.g. 0.12 = 12%/yr), or null when the time span is
 * under 6 months (CAGR isn't meaningful for short windows — better to
 * show simple appreciation %).
 */
export function calculateCAGR(
  startPrice: number,
  endPrice: number,
  startDate: Date | string,
  endDate: Date | string = new Date(),
): number | null {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const end = typeof endDate === "string" ? new Date(endDate) : endDate;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const years =
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 0.5) return null;
  if (startPrice <= 0 || endPrice <= 0) return null;
  return Math.pow(endPrice / startPrice, 1 / years) - 1;
}

/**
 * Forward-project a value at a given annual growth rate. Caps the rate
 * to a plausible band so a transient 40% YoY doesn't render a 10x
 * five-year projection that looks like a typo.
 */
export function projectValue(
  currentValue: number,
  annualRate: number,
  years = 5,
): number {
  const capped = Math.max(-0.2, Math.min(annualRate, 0.3));
  return currentValue * Math.pow(1 + capped, years);
}

// Long-run S&P 500 nominal return (~10%). Used as the investor-facing
// opportunity-cost baseline in the portfolio projection card.
export const SP500_ANNUAL_RETURN = 0.1;

export function formatPercent(value: number, decimals = 1): string {
  const pct = value * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

// ── Portfolio aggregation ────────────────────────────────────────────

export interface PortfolioWineInput {
  producer: string;
  name: string;
  vintage: number;
  purchasePrice: number;
  currentValue: number;
  createdAt: Date;
  /** Earliest WineValuation entry, or null if the wine has no price history. */
  earliestValuation: { price: number; date: Date } | null;
}

export interface PortfolioSummary {
  bottleCount: number;
  purchase: number;
  current: number;
  cagr: number | null;
  projectedFive: number | null;
  sp500ProjectedFive: number;
}

/**
 * Classify + aggregate investment-grade bottles into a portfolio summary.
 * Shared between the dashboard card and the /portfolio page so both views
 * report identical numbers. CAGR anchor is the earliest valuation date
 * across classified bottles; falls back to purchase + createdAt when a
 * wine has no valuation history.
 */
export function computePortfolioSummary(
  wines: PortfolioWineInput[],
  now: Date = new Date(),
): PortfolioSummary {
  let bottleCount = 0;
  let purchase = 0;
  let current = 0;
  let aggregateStart = 0;
  let earliest: Date | null = null;

  for (const w of wines) {
    if (!classifyInvestmentTier(w)) continue;
    bottleCount += 1;
    purchase += w.purchasePrice;
    current += w.currentValue;
    const anchorPrice = w.earliestValuation?.price ?? w.purchasePrice;
    const anchorDate = w.earliestValuation?.date ?? w.createdAt;
    aggregateStart += anchorPrice;
    if (!earliest || anchorDate < earliest) earliest = anchorDate;
  }

  const cagr =
    earliest && aggregateStart > 0
      ? calculateCAGR(aggregateStart, current, earliest, now)
      : null;
  const projectedFive = cagr != null ? projectValue(current, cagr, 5) : null;
  const sp500ProjectedFive = projectValue(current, SP500_ANNUAL_RETURN, 5);

  return {
    bottleCount,
    purchase,
    current,
    cagr,
    projectedFive,
    sp500ProjectedFive,
  };
}
