import Link from "next/link";
import { LineChart as LineChartIcon, ArrowRight } from "lucide-react";

/**
 * "Portfolio vs. Liv-ex 100" dashboard tile (feature #57).
 *
 * Numeric-only teaser — three stats (your YTD, Liv-ex YTD, your edge).
 * Click-through to `/portfolio` where the full chart lives. Hides
 * entirely when the series can't be built (empty portfolio, no Liv-ex
 * data, anchor bottle not held).
 */

export interface PortfolioVsLivexCardProps {
  hasData: boolean;
  windowType: "ytd" | "trailing_12m";
  portfolioChangePct: number | null;
  livexChangePct: number | null;
  deltaPct: number | null;
}

function pct(v: number | null): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function pts(v: number | null): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} pts`;
}

type Tone = "primary" | "ok" | "danger" | "gold" | "muted";

function toneFor(v: number | null, positive: Tone = "ok"): Tone {
  if (v == null) return "muted";
  return v >= 0 ? positive : "danger";
}

const toneClass: Record<Tone, string> = {
  primary: "text-primary",
  ok: "text-ok",
  danger: "text-danger",
  gold: "text-gold",
  muted: "text-muted",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Tone;
}) {
  return (
    <div>
      <p className="text-[11px] text-muted uppercase tracking-wider">{label}</p>
      <p
        className={`text-xl md:text-2xl font-semibold tabular-nums mt-1 ${toneClass[tone]}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function PortfolioVsLivexCard({
  hasData,
  windowType,
  portfolioChangePct,
  livexChangePct,
  deltaPct,
}: PortfolioVsLivexCardProps) {
  if (!hasData) return null;
  const windowLabel = windowType === "ytd" ? "YTD" : "trailing 12 mo";

  return (
    <Link
      href="/portfolio"
      className="block glass-card p-5 md:p-6 hover:bg-caveau-graphite/30 transition-colors group"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
          <LineChartIcon className="w-5 h-5 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-serif text-lg text-primary group-hover:text-gold transition-colors">
              Portfolio vs. Liv-ex 100
            </h2>
            <span className="flex items-center gap-1 text-xs text-muted">
              {windowLabel}
              <ArrowRight
                size={12}
                className="text-muted group-hover:text-gold transition-colors"
              />
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Both indexed to 100 at the window start. Positive edge means your
            portfolio is outpacing the Liv-ex Fine Wine 100.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Stat
              label="Your Portfolio"
              value={pct(portfolioChangePct)}
              tone={toneFor(portfolioChangePct)}
            />
            <Stat
              label="Liv-ex 100"
              value={pct(livexChangePct)}
              tone={toneFor(livexChangePct)}
            />
            <Stat
              label="Your Edge"
              value={pts(deltaPct)}
              tone={toneFor(deltaPct, "gold")}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
