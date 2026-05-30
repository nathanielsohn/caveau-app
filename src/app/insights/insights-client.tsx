"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarRange,
  ChartPie,
  Clock3,
  DollarSign,
  MapPinned,
  Package,
  TrendingUp,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency, formatCurrencyCompact } from "@/lib/utils";

export interface InsightSegment {
  key: string;
  label: string;
  count: number;
  value: number;
  percent: number;
}

export interface InsightsData {
  totalBottles: number;
  totalValue: number;
  averageValue: number;
  regions: InsightSegment[];
  decades: InsightSegment[];
  types: InsightSegment[];
  valueBands: InsightSegment[];
  drinkWindows: InsightSegment[];
}

interface InsightsClientProps {
  data: InsightsData;
}

const PALETTE = [
  "#FFD166",
  "#C23152",
  "#60A5FA",
  "#34D399",
  "#FBBF24",
  "#F87171",
  "#A78BFA",
  "#ADABA6",
];

const TYPE_COLORS: Record<string, string> = {
  red: "#C23152",
  white: "#FFD166",
  sparkling: "#60A5FA",
  rose: "#F472B6",
  dessert: "#D4A034",
  fortified: "#A78BFA",
  other: "#A0A0AA",
};

const DRINK_COLORS: Record<string, string> = {
  ready: "#34D399",
  aging: "#60A5FA",
  past: "#F87171",
  none: "#A0A0AA",
};

const tooltipStyle = {
  backgroundColor: "#141416",
  border: "1px solid #2A2A30",
  borderRadius: "12px",
  color: "#E8E6E1",
  fontSize: 12,
};

function withColors(
  segments: InsightSegment[],
  colorMap?: Record<string, string>,
): (InsightSegment & { color: string })[] {
  return segments.map((segment, index) => ({
    ...segment,
    color:
      colorMap?.[segment.key] ??
      PALETTE[index % PALETTE.length] ??
      "#A0A0AA",
  }));
}

function topLabel(segments: InsightSegment[]): string {
  if (segments.length === 0) return "-";
  const first = [...segments].sort(
    (a, b) => b.value - a.value || b.count - a.count,
  )[0];
  return first?.label ?? "-";
}

function SegmentSummary({
  data,
}: {
  data: (InsightSegment & { color: string })[];
}) {
  return (
    <div className="mt-4 space-y-2">
      {data.map((segment) => (
        <div
          key={segment.key}
          className="flex items-center gap-3 rounded-xl bg-caveau-graphite/40 border border-[#2A2A30]/50 px-3 py-2"
        >
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: segment.color }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-primary truncate">{segment.label}</p>
            <p className="text-[11px] text-muted">
              {segment.count} bottle{segment.count === 1 ? "" : "s"} -{" "}
              {segment.percent}%
            </p>
          </div>
          <p className="text-sm text-secondary tabular-nums">
            {formatCurrencyCompact(segment.value)}
          </p>
        </div>
      ))}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-56 flex flex-col items-center justify-center text-center px-6">
      <Wine size={28} className="text-muted/60 mb-2" strokeWidth={1.4} />
      <p className="text-sm text-secondary">No in-cellar bottles yet.</p>
    </div>
  );
}

function BarInsightCard({
  title,
  icon: Icon,
  data,
  colorMap,
  horizontal = false,
}: {
  title: string;
  icon: LucideIcon;
  data: InsightSegment[];
  colorMap?: Record<string, string>;
  horizontal?: boolean;
}) {
  const colored = withColors(data, colorMap);
  const totalValue = colored.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <section className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={17} className="text-gold shrink-0" />
          <h2 className="font-serif text-lg text-primary truncate">{title}</h2>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Value
          </p>
          <p className="text-sm font-semibold text-primary">
            {formatCurrencyCompact(totalValue)}
          </p>
        </div>
      </div>

      {colored.length === 0 ? (
        <EmptyChart />
      ) : (
        <>
          <div className="h-56 mt-4" role="img" aria-label={`${title} chart`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={colored}
                layout={horizontal ? "vertical" : "horizontal"}
                margin={
                  horizontal
                    ? { top: 6, right: 10, bottom: 0, left: 14 }
                    : { top: 8, right: 4, bottom: 0, left: -18 }
                }
              >
                {horizontal ? (
                  <>
                    <XAxis
                      type="number"
                      hide
                      dataKey="count"
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={88}
                      tick={{ fill: "#A0A0AA", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#A0A0AA", fontSize: 11 }}
                      axisLine={{ stroke: "#2A2A30" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#A0A0AA", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={30}
                    />
                  </>
                )}
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#2A2A3030" }}
                  formatter={(value: number, name: string, props) => {
                    const payload = props.payload as InsightSegment;
                    if (name === "count") {
                      return [
                        `${value} bottle${value === 1 ? "" : "s"}`,
                        "Count",
                      ];
                    }
                    return [formatCurrency(payload.value), "Value"];
                  }}
                />
                <Bar
                  dataKey="count"
                  radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                  maxBarSize={horizontal ? 18 : 34}
                >
                  {colored.map((segment) => (
                    <Cell key={segment.key} fill={segment.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SegmentSummary data={colored} />
        </>
      )}
    </section>
  );
}

function DonutInsightCard({
  title,
  icon: Icon,
  data,
  colorMap,
}: {
  title: string;
  icon: LucideIcon;
  data: InsightSegment[];
  colorMap?: Record<string, string>;
}) {
  const colored = withColors(data, colorMap);
  const totalCount = colored.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <section className="glass-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={17} className="text-gold shrink-0" />
          <h2 className="font-serif text-lg text-primary truncate">{title}</h2>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Leader
          </p>
          <p className="text-sm font-semibold text-primary truncate max-w-24">
            {topLabel(data)}
          </p>
        </div>
      </div>

      {colored.length === 0 ? (
        <EmptyChart />
      ) : (
        <>
          <div
            className="h-56 mt-4 relative"
            role="img"
            aria-label={`${title} distribution chart`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={colored}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={3}
                  stroke="none"
                >
                  {colored.map((segment) => (
                    <Cell key={segment.key} fill={segment.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _name: string, props) => {
                    const payload = props.payload as InsightSegment;
                    return [
                      `${value} bottle${value === 1 ? "" : "s"} - ${formatCurrencyCompact(
                        payload.value,
                      )}`,
                      payload.label,
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-semibold text-primary">
                {totalCount}
              </span>
              <span className="text-xs text-muted">bottles</span>
            </div>
          </div>
          <SegmentSummary data={colored} />
        </>
      )}
    </section>
  );
}

export default function InsightsClient({ data }: InsightsClientProps) {
  const readyNow =
    data.drinkWindows.find((segment) => segment.key === "ready")?.count ?? 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-primary">
            Collection Insights
          </h1>
          <p className="text-secondary text-sm mt-1">
            Portfolio-wide view across bottles currently in cellar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="glass-card p-4">
          <Package size={16} className="text-burgundy mb-3" />
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Bottles
          </p>
          <p className="text-xl font-semibold text-primary tabular-nums mt-1">
            {data.totalBottles}
          </p>
        </div>
        <div className="glass-card p-4">
          <TrendingUp size={16} className="text-ok mb-3" />
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Value
          </p>
          <p className="text-xl font-semibold text-primary tabular-nums mt-1">
            {formatCurrencyCompact(data.totalValue)}
          </p>
        </div>
        <div className="glass-card p-4">
          <DollarSign size={16} className="text-gold mb-3" />
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Avg Bottle
          </p>
          <p className="text-xl font-semibold text-primary tabular-nums mt-1">
            {formatCurrencyCompact(data.averageValue)}
          </p>
        </div>
        <div className="glass-card p-4">
          <Clock3 size={16} className="text-info mb-3" />
          <p className="text-[10px] uppercase tracking-wider text-muted">
            Ready Now
          </p>
          <p className="text-xl font-semibold text-primary tabular-nums mt-1">
            {readyNow}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BarInsightCard
          title="Collection by Region"
          icon={MapPinned}
          data={data.regions}
        />
        <BarInsightCard
          title="Vintage by Decade"
          icon={CalendarRange}
          data={data.decades}
        />
        <DonutInsightCard
          title="Inferred Color / Type"
          icon={ChartPie}
          data={data.types}
          colorMap={TYPE_COLORS}
        />
        <BarInsightCard
          title="Value Bands"
          icon={DollarSign}
          data={data.valueBands}
        />
        <DonutInsightCard
          title="Drink Window Status"
          icon={Clock3}
          data={data.drinkWindows}
          colorMap={DRINK_COLORS}
        />
      </div>
    </div>
  );
}
