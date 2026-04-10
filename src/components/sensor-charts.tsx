"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Sun, Moon, SunDim } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export interface SensorDataPoint {
  temperature: number;
  humidity: number;
  vibration: number;
  lightLux: number;
  timestamp: Date | string;
}

/** Format a timestamp for axis labels based on data density */
function formatTime(ts: Date | string): string {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes.toString().padStart(2, "0");
  return `${h}:${m} ${ampm}`;
}

/** Shared dark-themed tooltip style */
const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#141416",
    border: "1px solid #2A2A30",
    borderRadius: "12px",
    color: "#E8E6E1",
    fontSize: "13px",
  },
  labelStyle: { color: "#9B9A97" },
};

/* ------------------------------------------------------------------ */
/*  TemperatureChart                                                   */
/* ------------------------------------------------------------------ */

interface TemperatureChartProps {
  data: SensorDataPoint[];
}

export function TemperatureChart({ data }: TemperatureChartProps) {
  const chartData = data.map((d) => ({
    time: formatTime(d.timestamp),
    temperature: d.temperature,
    ts: typeof d.timestamp === "string" ? new Date(d.timestamp).getTime() : d.timestamp.getTime(),
  }));

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Temperature (°F)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="time"
              tick={{ fill: "#6B6B76", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[48, 62]}
              tick={{ fill: "#6B6B76", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}°`}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number) => [`${value.toFixed(1)}°F`, "Temperature"]}
            />
            {/* Alert threshold lines */}
            <ReferenceLine
              y={59}
              stroke="#F87171"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "Max 59°F",
                position: "right",
                fill: "#F87171",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#F87171"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: "Min 50°F",
                position: "right",
                fill: "#F87171",
                fontSize: 10,
              }}
            />
            <Area
              type="monotone"
              dataKey="temperature"
              stroke="#FFD166"
              strokeWidth={2}
              fill="url(#tempGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#FFD166", stroke: "#0A0A0B", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  HumidityChart                                                      */
/* ------------------------------------------------------------------ */

interface HumidityChartProps {
  data: SensorDataPoint[];
}

export function HumidityChart({ data }: HumidityChartProps) {
  const chartData = data.map((d) => ({
    time: formatTime(d.timestamp),
    humidity: d.humidity,
  }));

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Humidity (%)
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2A2A30"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6B6B76", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[50, 80]}
              tick={{ fill: "#6B6B76", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number) => [`${value.toFixed(1)}%`, "Humidity"]}
            />
            <ReferenceLine
              y={75}
              stroke="#FBBF24"
              strokeDasharray="6 4"
              strokeWidth={1}
              label={{
                value: "Max 75%",
                position: "right",
                fill: "#FBBF24",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={55}
              stroke="#FBBF24"
              strokeDasharray="6 4"
              strokeWidth={1}
              label={{
                value: "Min 55%",
                position: "right",
                fill: "#FBBF24",
                fontSize: 10,
              }}
            />
            <Line
              type="monotone"
              dataKey="humidity"
              stroke="#60A5FA"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#60A5FA", stroke: "#0A0A0B", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  VibrationGauge                                                     */
/* ------------------------------------------------------------------ */

interface VibrationGaugeProps {
  data: SensorDataPoint[];
}

/** Get a color for a vibration value: green <0.3, yellow 0.3–0.5, red >0.5 */
function vibrationColor(v: number): string {
  if (v > 0.5) return "#F87171"; // danger / red
  if (v >= 0.3) return "#FBBF24"; // warn / yellow
  return "#34D399"; // ok / green
}

function vibrationLabel(v: number): string {
  if (v > 0.5) return "High";
  if (v >= 0.3) return "Moderate";
  return "Low";
}

export function VibrationGauge({ data }: VibrationGaugeProps) {
  // Show last 20 readings as a bar chart with color-coded bars
  const recent = data.slice(-20);
  const chartData = recent.map((d) => ({
    time: formatTime(d.timestamp),
    vibration: d.vibration,
  }));

  const currentValue = data.length > 0 ? data[data.length - 1].vibration : 0;
  const color = vibrationColor(currentValue);
  const label = vibrationLabel(currentValue);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-secondary">
          Vibration (mm/s)
        </h3>
        <div className="flex items-center gap-2">
          <span
            className="text-lg font-semibold"
            style={{ color }}
          >
            {currentValue.toFixed(3)}
          </span>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              color,
              backgroundColor: `${color}15`,
            }}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2A2A30"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6B6B76", fontSize: 10 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 0.8]}
              tick={{ fill: "#6B6B76", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number) => [
                `${value.toFixed(3)} mm/s`,
                "Vibration",
              ]}
            />
            <ReferenceLine
              y={0.5}
              stroke="#F87171"
              strokeDasharray="6 4"
              strokeWidth={1}
              label={{
                value: "Alert",
                position: "right",
                fill: "#F87171",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={0.3}
              stroke="#FBBF24"
              strokeDasharray="6 4"
              strokeWidth={1}
            />
            <Bar dataKey="vibration" radius={[3, 3, 0, 0]} maxBarSize={16}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`vib-${index}`}
                  fill={vibrationColor(entry.vibration)}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-ok" />
          <span>&lt;0.3</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-warn" />
          <span>0.3–0.5</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-danger" />
          <span>&gt;0.5</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LightIndicator                                                     */
/* ------------------------------------------------------------------ */

interface LightIndicatorProps {
  data: SensorDataPoint[];
}

function lightStatus(lux: number): {
  label: string;
  color: string;
  Icon: typeof Sun;
  description: string;
} {
  if (lux > 50) {
    return {
      label: "Bright",
      color: "#F87171",
      Icon: Sun,
      description: "Excessive light detected — may damage wine",
    };
  }
  if (lux > 5) {
    return {
      label: "Low Light",
      color: "#FBBF24",
      Icon: SunDim,
      description: "Moderate ambient light",
    };
  }
  return {
    label: "Dark",
    color: "#34D399",
    Icon: Moon,
    description: "Optimal — cellar is dark",
  };
}

export function LightIndicator({ data }: LightIndicatorProps) {
  const currentLux = data.length > 0 ? data[data.length - 1].lightLux : 0;
  const { label, color, Icon, description } = lightStatus(currentLux);

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Light Level
      </h3>
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-7 h-7" style={{ color }} />
        </div>
        <div>
          <p className="text-xl font-semibold" style={{ color }}>
            {label}
          </p>
          <p className="text-sm text-muted mt-0.5">
            {currentLux.toFixed(1)} lux
          </p>
          <p className="text-xs text-secondary mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}
