"use client";

import Link from "next/link";
import dynamicImport from "next/dynamic";
import { TrendingUp, Sparkles, LineChart } from "lucide-react";
import {
  tierLabel,
  tierDescription,
  tierBadgeClass,
  formatPercent,
  type InvestmentTier,
} from "@/lib/investment";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import InsuranceSavingsCard from "@/components/insurance-savings-card";
import type { InsuranceSavingsEstimate } from "@/lib/insurance";

const PortfolioVsLivexChart = dynamicImport(
  () => import("@/components/portfolio-vs-livex-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="glass-card h-80 animate-pulse" aria-label="Loading chart" />
    ),
  },
);

export interface PortfolioVsLivexData {
  points: {
    date: string;
    label: string;
    portfolio: number;
    livex: number;
  }[];
  portfolioChangePct: number | null;
  livexChangePct: number | null;
  deltaPct: number | null;
  windowType: "ytd" | "trailing_12m";
  anchorDate: string | null;
}

export interface PortfolioBottle {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  region: string;
  tier: InvestmentTier;
  purchasePrice: number;
  currentValue: number;
  /** Null when the bottle's price history is too short to derive CAGR. */
  cagr: number | null;
  projectedFive: number | null;
}

interface Totals {
  purchase: number;
  current: number;
  cagr: number | null;
  projectedFive: number | null;
  sp500ProjectedFive: number;
  /** ISO timestamp of the earliest valuation anchor across the portfolio. */
  earliestAnchor: string | null;
}

interface PortfolioClientProps {
  bottles: PortfolioBottle[];
  totals: Totals;
  tierCounts: Record<InvestmentTier, number>;
  /** Static insurance savings estimate (#56). Uses the full in-cellar
   *  value, not just investment-grade — carriers insure the whole
   *  collection. */
  insuranceEstimate: InsuranceSavingsEstimate;
  /** Portfolio vs. Liv-ex 100 series (#57). Uses the full in-cellar
   *  collection (not just investment-grade bottles) since the index
   *  reflects the broad secondary market, not just trophy wines. */
  vsLivex: PortfolioVsLivexData;
}

function appreciation(b: PortfolioBottle): number {
  return b.purchasePrice > 0
    ? (b.currentValue - b.purchasePrice) / b.purchasePrice
    : 0;
}

export default function PortfolioClient({
  bottles,
  totals,
  tierCounts,
  insuranceEstimate,
  vsLivex,
}: PortfolioClientProps) {
  const totalAppreciation =
    totals.purchase > 0 ? (totals.current - totals.purchase) / totals.purchase : 0;

  const projectionVsSp =
    totals.projectedFive != null
      ? totals.projectedFive - totals.sp500ProjectedFive
      : 0;

  // Ordered tier rows for the breakdown strip so tiers render in canonical
  // "strongest → gateway" order even when a tier has zero bottles.
  const tiersWithBottles = (Object.keys(tierCounts) as InvestmentTier[])
    .filter((t) => tierCounts[t] > 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl text-primary">
            Investment Portfolio
          </h1>
          <p className="text-secondary text-sm mt-1">
            Investment-grade bottles classified by collector role, benchmarked
            against the S&P 500.
          </p>
        </div>
        <Link
          href="/collection"
          className="text-sm text-gold hover:text-gold-text transition-colors"
        >
          View full collection →
        </Link>
      </div>

      {/* Insurance Savings Estimate (feature #56) — always renders so it
          shows whether or not the member has investment-grade bottles
          classified. Carriers underwrite the whole collection. */}
      <InsuranceSavingsCard estimate={insuranceEstimate} />

      {bottles.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Sparkles className="w-10 h-10 text-gold/60 mx-auto mb-3" />
          <p className="font-serif text-xl text-primary">
            No investment-grade bottles yet
          </p>
          <p className="text-secondary text-sm mt-2 max-w-md mx-auto">
            Investment-grade bottles are trophy wines with deep secondary-market
            liquidity — Pétrus, Screaming Eagle, DRC, and the like. Add one to
            your collection to unlock portfolio analytics.
          </p>
        </div>
      ) : (
        <>
          {/* Portfolio summary strip */}
          <div className="glass-card p-6 md:p-8 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <SummaryStat
                label="Portfolio Value"
                value={formatCurrencyCompact(totals.current)}
                sub={`${bottles.length} bottle${bottles.length === 1 ? "" : "s"}`}
              />
              <SummaryStat
                label="Total Appreciation"
                value={formatPercent(totalAppreciation)}
                sub={`on ${formatCurrencyCompact(totals.purchase)} invested`}
                tone={totalAppreciation >= 0 ? "ok" : "danger"}
              />
              <SummaryStat
                label="Portfolio CAGR"
                value={totals.cagr != null ? formatPercent(totals.cagr) : "—"}
                sub={
                  totals.cagr != null
                    ? "annualized, Liv-ex sourced"
                    : "more history needed"
                }
                tone={
                  totals.cagr == null
                    ? "muted"
                    : totals.cagr >= 0
                      ? "ok"
                      : "danger"
                }
              />
              <SummaryStat
                label="5-Year Projection"
                value={
                  totals.projectedFive != null
                    ? formatCurrencyCompact(totals.projectedFive)
                    : "—"
                }
                sub={
                  totals.projectedFive != null
                    ? `vs S&P ${formatCurrencyCompact(totals.sp500ProjectedFive)}`
                    : "at current CAGR"
                }
                tone={projectionVsSp > 0 ? "gold" : "muted"}
              />
            </div>

            {/* Tier breakdown badges */}
            <div className="flex flex-wrap gap-2 pt-4 border-t border-[#2A2A30]/50">
              {tiersWithBottles.map((tier) => (
                <span
                  key={tier}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${tierBadgeClass(tier)}`}
                >
                  <span className="font-medium">{tierLabel(tier)}</span>
                  <span className="opacity-75">· {tierCounts[tier]}</span>
                </span>
              ))}
            </div>
          </div>

          {/* vs S&P 500 explainer card */}
          {totals.projectedFive != null && (
            <div className="glass-card p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center flex-shrink-0">
                <LineChart className="w-5 h-5 text-gold" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-lg text-primary">
                  Portfolio vs S&P 500 Baseline
                </h2>
                <p className="text-sm text-secondary mt-1">
                  Held at the current Liv-ex-implied CAGR, your portfolio
                  projects to{" "}
                  <span className="text-gold font-medium">
                    {formatCurrency(totals.projectedFive)}
                  </span>{" "}
                  in 5 years. At the long-run S&P 500 return of{" "}
                  <span className="text-secondary font-medium">10%</span>, the
                  same capital would reach{" "}
                  <span className="text-primary font-medium">
                    {formatCurrency(totals.sp500ProjectedFive)}
                  </span>
                  .{" "}
                  {projectionVsSp >= 0 ? (
                    <>
                      Wine projects to outperform by{" "}
                      <span className="text-ok font-medium">
                        {formatCurrency(projectionVsSp)}
                      </span>
                      .
                    </>
                  ) : (
                    <>
                      Wine projects to trail by{" "}
                      <span className="text-danger font-medium">
                        {formatCurrency(Math.abs(projectionVsSp))}
                      </span>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Portfolio vs. Liv-ex 100 (feature #57). Full in-cellar
              series indexed to 100 at the window start. Renders only
              when we have two or more snapshot points; the card hides
              itself below. */}
          {vsLivex.points.length >= 2 && (
            <PortfolioVsLivexChart
              points={vsLivex.points}
              portfolioChangePct={vsLivex.portfolioChangePct}
              livexChangePct={vsLivex.livexChangePct}
              deltaPct={vsLivex.deltaPct}
              windowType={vsLivex.windowType}
              anchorDate={vsLivex.anchorDate}
            />
          )}

          {/* Per-bottle breakdown — matches the 10-Bottle PDF format:
              tier label, purchase, current, CAGR, 5-year projection. */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 md:px-6 py-4 border-b border-[#2A2A30]/50">
              <h2 className="font-serif text-lg text-primary">
                Per-Bottle Breakdown
              </h2>
            </div>

            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-[#2A2A30]/50">
              {bottles.map((b) => (
                <Link
                  key={b.id}
                  href={`/wine/${b.id}`}
                  className="block px-5 py-4 hover:bg-caveau-graphite/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-serif text-primary truncate">
                        {b.name}
                      </p>
                      <p className="text-xs text-muted truncate mt-0.5">
                        {b.vintage} · {b.region}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${tierBadgeClass(b.tier)}`}
                    >
                      {tierLabel(b.tier)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted">Current</p>
                      <p className="text-primary font-medium tabular-nums">
                        {formatCurrencyCompact(b.currentValue)}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">CAGR</p>
                      <p
                        className={`font-medium tabular-nums ${
                          b.cagr == null
                            ? "text-muted"
                            : b.cagr >= 0
                              ? "text-ok"
                              : "text-danger"
                        }`}
                      >
                        {b.cagr != null ? formatPercent(b.cagr) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted">5yr</p>
                      <p className="text-gold font-medium tabular-nums">
                        {b.projectedFive != null
                          ? formatCurrencyCompact(b.projectedFive)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: proper table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2A2A30]/50">
                    <th className="text-left text-muted font-medium py-3 px-5">
                      Bottle
                    </th>
                    <th className="text-left text-muted font-medium py-3 px-3">
                      Tier
                    </th>
                    <th className="text-right text-muted font-medium py-3 px-3">
                      Purchase
                    </th>
                    <th className="text-right text-muted font-medium py-3 px-3">
                      Current
                    </th>
                    <th className="text-right text-muted font-medium py-3 px-3">
                      Appreciation
                    </th>
                    <th className="text-right text-muted font-medium py-3 px-3">
                      CAGR
                    </th>
                    <th className="text-right text-muted font-medium py-3 px-5">
                      5-Year Projection
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bottles.map((b) => {
                    const app = appreciation(b);
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-[#2A2A30]/30 last:border-0 hover:bg-caveau-graphite/30 transition-colors"
                      >
                        <td className="py-3 px-5 max-w-0">
                          <Link
                            href={`/wine/${b.id}`}
                            className="block hover:text-gold transition-colors"
                          >
                            <p className="font-serif text-primary truncate">
                              {b.name}
                            </p>
                            <p className="text-xs text-muted mt-0.5 truncate">
                              {b.vintage} · {b.region}
                            </p>
                          </Link>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${tierBadgeClass(b.tier)}`}
                            title={tierDescription(b.tier)}
                          >
                            {tierLabel(b.tier)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-secondary tabular-nums">
                          {formatCurrency(b.purchasePrice)}
                        </td>
                        <td className="py-3 px-3 text-right text-primary font-medium tabular-nums">
                          {formatCurrency(b.currentValue)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                              app >= 0 ? "text-ok" : "text-danger"
                            }`}
                          >
                            <TrendingUp
                              size={12}
                              className={app < 0 ? "rotate-180" : ""}
                            />
                            {formatPercent(app)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          <span
                            className={`text-sm font-medium ${
                              b.cagr == null
                                ? "text-muted"
                                : b.cagr >= 0
                                  ? "text-ok"
                                  : "text-danger"
                            }`}
                          >
                            {b.cagr != null ? formatPercent(b.cagr) : "—"}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-right text-gold font-medium tabular-nums">
                          {b.projectedFive != null
                            ? formatCurrency(b.projectedFive)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footnote */}
          <p className="text-xs text-muted text-center">
            CAGR derived from earliest Liv-ex valuation to current value.
            Projections are informational, not investment advice; actuals will
            vary with release cycles, vintage variation, and secondary-market
            demand.
          </p>
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone = "primary",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "primary" | "ok" | "danger" | "muted" | "gold";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "danger"
        ? "text-danger"
        : tone === "muted"
          ? "text-muted"
          : tone === "gold"
            ? "text-gold"
            : "text-primary";
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider">{label}</p>
      <p
        className={`text-2xl md:text-3xl font-semibold tracking-tight tabular-nums mt-1 ${toneClass}`}
      >
        {value}
      </p>
      <p className="text-xs text-muted mt-0.5">{sub}</p>
    </div>
  );
}
