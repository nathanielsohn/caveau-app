"use client";

import { useState, useRef, useTransition } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Plus, X, TrendingUp, TrendingDown } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "#141416",
  border: "1px solid #2A2A30",
  borderRadius: "12px",
  color: "#E8E6E1",
  fontSize: 12,
};

const SOURCE_COLORS: Record<string, string> = {
  manual: "#FFD166",
  "liv-ex": "#60A5FA",
  "wine-searcher": "#34D399",
  auction: "#C23152",
};

interface ValuationPoint {
  id: string;
  source: string;
  price: number;
  date: string;
}

interface ValuationChartProps {
  valuations: ValuationPoint[];
  purchasePrice: number;
  currentValue: number;
  appreciation: number;
  wineId: string;
  addValuationAction: (formData: FormData) => Promise<void>;
  /** ISO timestamp — most recent Liv-ex sync, or latest valuation as fallback. */
  lastSyncedAt?: string | null;
}

function formatChartValue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatChartDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function ValuationChart({
  valuations,
  purchasePrice,
  appreciation,
  wineId,
  addValuationAction,
  lastSyncedAt,
}: ValuationChartProps) {
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isPositive = appreciation >= 0;

  // Prepare chart data — sorted by date
  const chartData = valuations
    .map((v) => ({
      date: v.date,
      price: v.price,
      source: v.source,
      label: formatChartDate(v.date),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Source breakdown for legend
  const sourceCounts: Record<string, number> = {};
  valuations.forEach((v) => {
    sourceCounts[v.source] = (sourceCounts[v.source] || 0) + 1;
  });

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addValuationAction(formData);
        formRef.current?.reset();
        setShowForm(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add valuation");
      }
    });
  }

  return (
    <div className="glass-card p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-primary">Price History</h2>
          {lastSyncedAt && (
            <p className="text-[11px] text-muted mt-0.5 tabular-nums">
              Last updated {formatRelativeTime(lastSyncedAt)}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs text-gold hover:text-gold-text transition-colors flex-shrink-0"
        >
          {showForm ? (
            <>
              <X size={14} />
              Cancel
            </>
          ) : (
            <>
              <Plus size={14} />
              Add Valuation
            </>
          )}
        </button>
      </div>

      {/* Add valuation form */}
      {showForm && (
        <div className="p-4 rounded-xl bg-caveau-graphite/50 border border-[#2A2A30]/50">
          {error && (
            <div className="mb-3 p-2.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs">
              {error}
            </div>
          )}
          <form ref={formRef} action={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input type="hidden" name="wineId" value={wineId} />
            <div className="flex-1">
              <label htmlFor="val-price" className="block text-xs text-muted mb-1">
                Price (USD)
              </label>
              <input
                id="val-price"
                name="price"
                type="number"
                required
                min={0}
                step={0.01}
                placeholder="5,200.00"
                className="w-full bg-[#0A0A0B] border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <div className="sm:w-36">
              <label htmlFor="val-source" className="block text-xs text-muted mb-1">
                Source
              </label>
              <select
                id="val-source"
                name="source"
                defaultValue="manual"
                className="w-full appearance-none bg-[#0A0A0B] border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors cursor-pointer"
              >
                <option value="manual">Manual</option>
                <option value="liv-ex">Liv-ex</option>
                <option value="wine-searcher">Wine-Searcher</option>
                <option value="auction">Auction</option>
              </select>
            </div>
            <div className="sm:w-36">
              <label htmlFor="val-date" className="block text-xs text-muted mb-1">
                Date
              </label>
              <input
                id="val-date"
                name="date"
                type="date"
                defaultValue={new Date().toISOString().split("T")[0]}
                className="w-full bg-[#0A0A0B] border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary focus:outline-none focus:border-gold/50 transition-colors"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isPending}
                className="btn-gold text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Appreciation summary */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-ok" />
          ) : (
            <TrendingDown className="w-4 h-4 text-danger" />
          )}
          <span
            className={`text-sm font-semibold ${
              isPositive ? "text-ok" : "text-danger"
            }`}
          >
            {isPositive ? "+" : ""}
            {appreciation.toFixed(1)}%
          </span>
        </div>
        <span className="text-xs text-muted">
          since purchase &middot; {valuations.length} valuation
          {valuations.length !== 1 ? "s" : ""} recorded
        </span>
      </div>

      {/* Chart */}
      <div className="h-56">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            No valuation data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id="priceHistGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor="#FFD166" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#FFD166" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2A2A30"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#6B6B76", fontSize: 11 }}
                axisLine={{ stroke: "#2A2A30" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6B6B76", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={formatChartValue}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, _name: string, props: { payload?: { source?: string } }) => [
                  formatChartValue(value),
                  props.payload?.source ?? "Price",
                ]}
                labelFormatter={(label: string) => label}
              />
              <ReferenceLine
                y={purchasePrice}
                stroke="#6B6B76"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: "Purchase",
                  position: "right",
                  fill: "#6B6B76",
                  fontSize: 10,
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#FFD166"
                strokeWidth={2}
                fill="url(#priceHistGradient)"
                dot={(props: { cx: number; cy: number; payload?: { source?: string } }) => {
                  const source = props.payload?.source ?? "manual";
                  return (
                    <circle
                      key={`dot-${props.cx}-${props.cy}`}
                      cx={props.cx}
                      cy={props.cy}
                      r={4}
                      fill={SOURCE_COLORS[source] ?? "#FFD166"}
                      stroke="#141416"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 5, fill: "#FFD166", stroke: "#141416", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Source legend */}
      {Object.keys(sourceCounts).length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs">
          {Object.entries(sourceCounts).map(([source, count]) => (
            <div key={source} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  backgroundColor: SOURCE_COLORS[source] ?? "#FFD166",
                }}
              />
              <span className="text-secondary">
                {source} ({count})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
