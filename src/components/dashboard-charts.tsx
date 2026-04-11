"use client";

import { memo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "#141416",
  border: "1px solid #2A2A30",
  borderRadius: "12px",
  color: "#E8E6E1",
  fontSize: 12,
};

/* ── Collection Value Chart (Area) ─────────────────── */

interface CollectionValueChartProps {
  data: { date: string; value: number }[];
}

export const CollectionValueChart = memo(function CollectionValueChart({ data }: CollectionValueChartProps) {
  const formatValue = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v}`;
  };

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Collection Value Trend
      </h3>
      <div className="h-64" role="img" aria-label="Collection value trend chart">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            No valuation data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
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
                dataKey="date"
                tick={{ fill: "#8B8B96", fontSize: 11 }}
                axisLine={{ stroke: "#2A2A30" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#8B8B96", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={formatValue}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [formatValue(value), "Value"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#FFD166"
                strokeWidth={2}
                fill="url(#valueGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "#FFD166" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});

/* ── Storage Utilization Chart (Donut) ─────────────── */

interface StorageUtilizationChartProps {
  occupied: number;
  total: number;
}

export const StorageUtilizationChart = memo(function StorageUtilizationChart({
  occupied,
  total,
}: StorageUtilizationChartProps) {
  const empty = total - occupied;
  const percent = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const pieData = [
    { name: "Occupied", value: occupied },
    { name: "Available", value: empty },
  ];

  const COLORS = ["#FFD166", "#2A2A30"];

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Storage Utilization
      </h3>
      <div className="h-64 flex flex-col items-center justify-center" role="img" aria-label={`Storage utilization: ${percent}% occupied`}>
        <div className="relative w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [
                  `${value} slots`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-semibold text-primary">
              {percent}%
            </span>
            <span className="text-xs text-muted">used</span>
          </div>
        </div>
        <div className="flex gap-4 text-xs mt-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD166]" />
            <span className="text-secondary">
              {occupied} occupied
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A2A30]" />
            <span className="text-secondary">
              {empty} available
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

/* ── Alert Frequency Chart (Bar) ───────────────────── */

interface AlertFrequencyChartProps {
  data: { date: string; count: number }[];
}

export const AlertFrequencyChart = memo(function AlertFrequencyChart({ data }: AlertFrequencyChartProps) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Alert Frequency (Last 30 Days)
      </h3>
      <div className="h-52" role="img" aria-label="Alert frequency bar chart for the last 30 days">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            No alerts in the last 30 days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2A2A30"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "#8B8B96", fontSize: 11 }}
                axisLine={{ stroke: "#2A2A30" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#8B8B96", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [`${value}`, "Alerts"]}
                cursor={{ fill: "#2A2A3020" }}
              />
              <Bar
                dataKey="count"
                fill="#C23152"
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
});
