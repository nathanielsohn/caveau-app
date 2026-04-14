"use client";

import { memo } from "react";
import { useSession } from "next-auth/react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { DoorOpen } from "lucide-react";

export interface SensorDataPoint {
  timestamp: string; // formatted time label
  temperature: number;
  humidity: number;
  vibration: number;
  lightLux: number;
}

/* ── Temperature Chart ─────────────────────────────── */

export const TemperatureChart = memo(function TemperatureChart({ data }: { data: SensorDataPoint[] }) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Temperature (°F)
      </h3>
      <div className="h-56" role="img" aria-label="Temperature readings chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
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
              dataKey="timestamp"
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
            />
            <YAxis
              domain={[45, 65]}
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#141416",
                border: "1px solid #2A2A30",
                borderRadius: "12px",
                color: "#E8E6E1",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(1)}°F`, "Temp"]}
            />
            <ReferenceLine
              y={59}
              stroke="#F87171"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: "59°F max",
                position: "right",
                fill: "#F87171",
                fontSize: 10,
              }}
            />
            <ReferenceLine
              y={50}
              stroke="#F87171"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{
                value: "50°F min",
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
              activeDot={{ r: 4, fill: "#FFD166" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

/* ── Humidity Chart ─────────────────────────────────── */

export const HumidityChart = memo(function HumidityChart({ data }: { data: SensorDataPoint[] }) {
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Humidity (%)
      </h3>
      <div className="h-56" role="img" aria-label="Humidity readings chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2A2A30"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={{ stroke: "#2A2A30" }}
              tickLine={false}
            />
            <YAxis
              domain={[50, 80]}
              tick={{ fill: "#8B8B96", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={35}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#141416",
                border: "1px solid #2A2A30",
                borderRadius: "12px",
                color: "#E8E6E1",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value.toFixed(1)}%`, "Humidity"]}
            />
            <ReferenceLine
              y={75}
              stroke="#FBBF24"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <ReferenceLine
              y={55}
              stroke="#FBBF24"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <Line
              type="monotone"
              dataKey="humidity"
              stroke="#60A5FA"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#60A5FA" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

/* ── Vibration Gauge ───────────────────────────────── */

export const VibrationGauge = memo(function VibrationGauge({ value }: { value: number }) {
  // Map vibration value to a 0-100 scale for the bar
  // 0 mm/s = 0%, 1.0 mm/s = 100%
  const percent = Math.min((value / 1.0) * 100, 100);
  const color =
    value > 0.5 ? "#F87171" : value > 0.3 ? "#FBBF24" : "#34D399";
  const label =
    value > 0.5 ? "High" : value > 0.3 ? "Elevated" : "Normal";

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Vibration
      </h3>
      <div className="flex flex-col items-center gap-3" role="img" aria-label={`Vibration level: ${value.toFixed(2)} mm/s, ${label}`}>
        <p className="text-3xl font-semibold text-primary">
          {value.toFixed(2)}{" "}
          <span className="text-sm text-muted font-normal">mm/s</span>
        </p>
        {/* Bar gauge */}
        <div className="w-full h-3 rounded-full bg-[#1C1C20] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percent}%`,
              backgroundColor: color,
            }}
          />
        </div>
        {/* Zone labels */}
        <div className="flex justify-between w-full text-[10px] text-muted">
          <span>0</span>
          <span className="text-ok">Normal</span>
          <span className="text-warn">0.3</span>
          <span className="text-danger">0.5+</span>
          <span>1.0</span>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ color, backgroundColor: `${color}20` }}
        >
          {label}
        </span>
      </div>
    </div>
  );
});

/* ── Access Log ────────────────────────────────────── */

// DEMO: hardcoded access events for the Sentinel demo. There is no real
// access-control feed wired up yet (roadmap #25 — staff check-in/out
// workflow). When that ships, replace this with a query against the
// alerts/access table scoped to the current locker. Until then, treat the
// data below as illustrative seed content.
function getAccessEvents(memberName: string) {
  return [
    { time: "2h ago", person: memberName, type: "Member badge", zone: "Zone A" },
    { time: "5h ago", person: "Samuel Jalloh", type: "Staff badge", zone: "Reserve Room" },
    { time: "Yesterday", person: memberName, type: "Member badge", zone: "Zone C" },
    { time: "2 days ago", person: "HVAC Technician", type: "Service access", zone: "Mechanical" },
    { time: "3 days ago", person: memberName, type: "Member badge", zone: "Zone A" },
  ];
}

export function AccessLog() {
  const { data: session } = useSession();
  const memberName = session?.user?.name ?? "Member";
  const accessEvents = getAccessEvents(memberName);
  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-medium text-secondary mb-4">
        Access Log
      </h3>
      <div className="space-y-3">
        {accessEvents.map((event, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-caveau-graphite/30"
          >
            <div className="w-8 h-8 rounded-lg bg-[#60A5FA]/10 flex items-center justify-center flex-shrink-0">
              <DoorOpen size={14} className="text-[#60A5FA]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-primary truncate">{event.person}</p>
              <p className="text-[10px] text-muted">
                {event.type} &middot; {event.zone}
              </p>
            </div>
            <span className="text-[10px] text-muted whitespace-nowrap">
              {event.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
