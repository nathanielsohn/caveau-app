"use client";

import { memo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/**
 * Full "Portfolio vs. Liv-ex 100" chart (feature #57) for the portfolio
 * page. Two Recharts lines — gold for the member, dashed muted for the
 * index — both indexed to 100 at the anchor so the comparison reads as
 * percent rather than a mixed-units dual-axis.
 *
 * The component is dynamic-imported from portfolio-client.tsx so
 * Recharts doesn't ship on the server render.
 */

export interface PortfolioVsLivexChartPoint {
  date: string;
  label: string;
  portfolio: number;
  livex: number;
}

interface Props {
  points: PortfolioVsLivexChartPoint[];
  portfolioChangePct: number | null;
  livexChangePct: number | null;
  deltaPct: number | null;
  windowType: "ytd" | "trailing_12m";
  anchorDate: string | null;
}

const tooltipStyle = {
  backgroundColor: "#141416",
  border: "1px solid #2A2A30",
  borderRadius: "12px",
  color: "#E8E6E1",
  fontSize: 12,
};

function formatAnchor(iso: string | null): string {
  if (!iso) return "window start";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function pts(v: number): string {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} pts`;
}

export default memo(function PortfolioVsLivexChart({
  points,
  portfolioChangePct,
  livexChangePct,
  deltaPct,
  windowType,
  anchorDate,
}: Props) {
  if (points.length < 2) return null;
  const windowLabel = windowType === "ytd" ? "YTD" : "trailing 12 months";
  const deltaLabel =
    deltaPct == null
      ? null
      : deltaPct >= 0
        ? `Your portfolio is ${pts(deltaPct)} ahead of the Liv-ex 100 ${windowLabel}.`
        : `Your portfolio trails the Liv-ex 100 by ${pts(Math.abs(deltaPct))} ${windowLabel}.`;

  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-lg text-primary">
            Portfolio vs. Liv-ex 100
          </h2>
          <p className="text-xs text-muted mt-1">
            {windowType === "ytd" ? "Year-to-date" : "Trailing 12 months"} —
            both indexed to 100 on {formatAnchor(anchorDate)}.
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="text-right">
            <p className="text-muted uppercase tracking-wider text-[10px]">
              Portfolio
            </p>
            <p
              className={`font-semibold tabular-nums ${
                portfolioChangePct == null
                  ? "text-muted"
                  : portfolioChangePct >= 0
                    ? "text-ok"
                    : "text-danger"
              }`}
            >
              {portfolioChangePct == null
                ? "—"
                : `${portfolioChangePct >= 0 ? "+" : ""}${portfolioChangePct.toFixed(1)}%`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted uppercase tracking-wider text-[10px]">
              Liv-ex 100
            </p>
            <p
              className={`font-semibold tabular-nums ${
                livexChangePct == null
                  ? "text-muted"
                  : livexChangePct >= 0
                    ? "text-ok"
                    : "text-danger"
              }`}
            >
              {livexChangePct == null
                ? "—"
                : `${livexChangePct >= 0 ? "+" : ""}${livexChangePct.toFixed(1)}%`}
            </p>
          </div>
        </div>
      </div>

      <div
        className="h-72 mt-4"
        role="img"
        aria-label="Portfolio vs. Liv-ex 100 index chart, both indexed to 100 at the window start"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 10, right: 12, bottom: 0, left: -8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2A2A30"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toFixed(0)}
            />
            <ReferenceLine
              y={100}
              stroke="#2A2A30"
              strokeDasharray="2 4"
              label={{
                value: "Baseline",
                position: "insideLeft",
                fill: "#5A5A66",
                fontSize: 10,
              }}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number, name: string) => {
                const displayName =
                  name === "portfolio" ? "Your Portfolio" : "Liv-ex 100";
                const delta = value - 100;
                const sign = delta >= 0 ? "+" : "";
                return [
                  `${value.toFixed(2)} (${sign}${delta.toFixed(1)}%)`,
                  displayName,
                ];
              }}
            />
            <Legend
              formatter={(v: string) =>
                v === "portfolio" ? "Your Portfolio" : "Liv-ex 100"
              }
              wrapperStyle={{ fontSize: 12, color: "#8B8B96" }}
              iconType="line"
            />
            <Line
              type="monotone"
              dataKey="portfolio"
              stroke="#FFD166"
              strokeWidth={2}
              dot={{ r: 3, fill: "#FFD166", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="livex"
              stroke="#8B8B96"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: "#8B8B96", strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {deltaLabel && (
        <p className="text-xs text-secondary mt-3 text-center">{deltaLabel}</p>
      )}
    </div>
  );
});
