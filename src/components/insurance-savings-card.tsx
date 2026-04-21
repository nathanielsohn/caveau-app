import { Shield } from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";
import { TIERS, type TierSlug } from "@/lib/tiers";
import type { InsuranceSavingsEstimate } from "@/lib/insurance";

/**
 * "Estimated Insurance Savings" card (feature #56).
 *
 * Rendered on both the dashboard and the portfolio page so the demo
 * number shows up wherever an investor lands. Always-on — unlike the
 * exit-signals card, which hides when the member has no open signals,
 * the savings story doesn't depend on any runtime state beyond a
 * non-zero collection value.
 *
 * Intentionally pure display — no hooks, no client interactivity — so it
 * can be used from server components without a "use client" boundary.
 */
function tierName(slug: TierSlug): string {
  return TIERS.find((t) => t.slug === slug)?.name ?? "Collector";
}

export default function InsuranceSavingsCard({
  estimate,
}: {
  estimate: InsuranceSavingsEstimate;
}) {
  const {
    savingsLowUsd,
    savingsHighUsd,
    discountPctLow,
    discountPctHigh,
    baselinePremiumLowUsd,
    baselinePremiumHighUsd,
    collectionValueUsd,
    tier,
    partners,
    disciplineBullets,
  } = estimate;

  const savingsRange =
    collectionValueUsd > 0
      ? `${formatCurrencyCompact(savingsLowUsd)} – ${formatCurrencyCompact(savingsHighUsd)}`
      : "—";

  const baselineRange =
    collectionValueUsd > 0
      ? `${formatCurrencyCompact(baselinePremiumLowUsd)} – ${formatCurrencyCompact(baselinePremiumHighUsd)}`
      : "—";

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/30 flex items-center justify-center flex-shrink-0">
          <Shield className="w-5 h-5 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-serif text-lg text-primary">
              Estimated Insurance Savings
            </h2>
            <span className="text-xs text-muted">{tierName(tier)} tier</span>
          </div>
          <p className="text-xs text-muted mt-1">
            Certified Caveau storage, Sentinel monitoring, and evacuation
            protocols typically earn a carrier discount on collectibles
            premiums.
          </p>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-caveau-graphite/30 border border-[#2A2A30]/50">
              <p className="text-xs text-muted">Estimated annual savings</p>
              <p className="mt-1 font-serif text-2xl text-gold tabular-nums">
                {savingsRange}
              </p>
              <p className="text-[11px] text-muted mt-1">
                {Math.round(discountPctLow * 100)}–
                {Math.round(discountPctHigh * 100)}% off a{" "}
                <span title={`On ${formatCurrency(collectionValueUsd)} collection value`}>
                  {baselineRange}/yr
                </span>{" "}
                baseline premium
              </p>
            </div>
            <div className="p-3 rounded-xl bg-caveau-graphite/30 border border-[#2A2A30]/50">
              <p className="text-xs text-muted">Named partner carriers</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {partners.map((p) => (
                  <span
                    key={p.name}
                    title={p.focus}
                    className="inline-flex px-2 py-0.5 rounded-full text-[11px] bg-caveau-graphite/60 border border-[#2A2A30]/80 text-secondary"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2">
                HNW &amp; collectibles specialists we route storage letters to.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs text-muted">
              Your storage discipline (what carriers underwrite)
            </p>
            <ul className="mt-2 space-y-1">
              {disciplineBullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-2 text-xs text-secondary"
                >
                  <span className="text-gold mt-0.5">◈</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-[11px] text-muted italic">
            Static estimate based on typical collectibles premium norms
            (1.0–1.5% of value) and a 20–35% Caveau-storage discount band.
            Not a quote — actual rates vary by carrier, location, and
            endorsements.
          </p>
        </div>
      </div>
    </div>
  );
}
