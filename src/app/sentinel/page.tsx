"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Thermometer,
  Droplets,
  Waves,
  Sun,
  Activity,
  Shield,
} from "lucide-react";
import { simulateReading, checkThresholds } from "@/lib/sensors";
import type { SensorSnapshot, LiveAlert } from "@/lib/sensors";
import {
  TemperatureChart,
  HumidityChart,
  VibrationGauge,
  LightIndicator,
} from "@/components/sensor-charts";
import type { SensorDataPoint } from "@/components/sensor-charts";
import AlertList from "@/components/alert-list";
import type { AlertItem } from "@/components/alert-list";
import {
  fetchSensorReadings,
  fetchAlerts,
} from "./actions";
import type { DbSensorReading } from "./actions";
import { THRESHOLDS } from "@/lib/sensors";

/* ── Types ─────────────────────────────────────────── */

type TimeRange = "1H" | "6H" | "24H" | "7D" | "30D";

const TIME_RANGE_HOURS: Record<TimeRange, number> = {
  "1H": 1,
  "6H": 6,
  "24H": 24,
  "7D": 168,
  "30D": 720,
};

/* ── Helpers ───────────────────────────────────────── */

function formatTimestamp(date: Date | string, range: TimeRange): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (range === "1H" || range === "6H") {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (range === "24H") {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

function snapshotToDataPoint(
  s: SensorSnapshot,
  range: TimeRange
): SensorDataPoint {
  return {
    timestamp: formatTimestamp(s.timestamp, range),
    temperature: s.temperature,
    humidity: s.humidity,
    vibration: s.vibration,
    lightLux: s.lightLux,
  };
}

function dbReadingToDataPoint(
  r: DbSensorReading,
  range: TimeRange
): SensorDataPoint {
  return {
    timestamp: formatTimestamp(r.timestamp, range),
    temperature: r.temperature,
    humidity: r.humidity,
    vibration: r.vibration,
    lightLux: r.lightLux,
  };
}

function getConditionStatus(
  type: "temperature" | "humidity" | "vibration" | "light",
  value: number
): { label: string; color: string; bgColor: string } {
  if (type === "temperature") {
    if (value > THRESHOLDS.temp.max || value < THRESHOLDS.temp.min)
      return { label: "Critical", color: "#F87171", bgColor: "#F8717120" };
    if (value > THRESHOLDS.temp.max - 2 || value < THRESHOLDS.temp.min + 2)
      return { label: "Warning", color: "#FBBF24", bgColor: "#FBBF2420" };
    return { label: "Normal", color: "#34D399", bgColor: "#34D39920" };
  }
  if (type === "humidity") {
    if (value > THRESHOLDS.humidity.max || value < THRESHOLDS.humidity.min)
      return { label: "Warning", color: "#FBBF24", bgColor: "#FBBF2420" };
    return { label: "Normal", color: "#34D399", bgColor: "#34D39920" };
  }
  if (type === "vibration") {
    if (value > THRESHOLDS.vibration.max)
      return { label: "High", color: "#F87171", bgColor: "#F8717120" };
    if (value > 0.3)
      return { label: "Elevated", color: "#FBBF24", bgColor: "#FBBF2420" };
    return { label: "Normal", color: "#34D399", bgColor: "#34D39920" };
  }
  // light
  if (value > 10)
    return { label: "Detected", color: "#FBBF24", bgColor: "#FBBF2420" };
  return { label: "Dark", color: "#34D399", bgColor: "#34D39920" };
}

/* ── Page Component ────────────────────────────────── */

export default function SentinelPage() {
  const [range, setRange] = useState<TimeRange>("1H");
  const [liveReadings, setLiveReadings] = useState<SensorSnapshot[]>([]);
  const [dbReadings, setDbReadings] = useState<DbSensorReading[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [dbAlerts, setDbAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Current reading is the latest live reading or a fresh simulated one
  const currentReading =
    liveReadings.length > 0
      ? liveReadings[liveReadings.length - 1]
      : simulateReading();

  /* ── Fetch DB data ─────────────────────────────── */
  const loadDbData = useCallback(async (selectedRange: TimeRange) => {
    setLoading(true);
    try {
      const [readings, alerts] = await Promise.all([
        fetchSensorReadings(TIME_RANGE_HOURS[selectedRange]),
        fetchAlerts(),
      ]);
      setDbReadings(readings);
      setDbAlerts(
        alerts.map((a) => ({
          ...a,
          isNew: false,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch sensor data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Initial load + range changes ──────────────── */
  useEffect(() => {
    loadDbData(range);
  }, [range, loadDbData]);

  /* ── Live simulation (runs always for current values) */
  useEffect(() => {
    // Generate initial reading
    const initial = simulateReading();
    setLiveReadings([initial]);

    intervalRef.current = setInterval(() => {
      const reading = simulateReading();
      setLiveReadings((prev) => {
        // Keep last ~720 readings (1 hour at 5s intervals)
        const updated = [...prev, reading];
        return updated.length > 720
          ? updated.slice(updated.length - 720)
          : updated;
      });

      // Check for threshold breaches
      const newAlerts = checkThresholds(reading);
      if (newAlerts.length > 0) {
        setLiveAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));
      }
    }, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  /* ── Build chart data based on selected range ──── */
  const chartData: SensorDataPoint[] = (() => {
    if (range === "1H") {
      // Hybrid: DB data + live data
      const dbPoints = dbReadings.map((r) => dbReadingToDataPoint(r, range));
      const livePoints = liveReadings.map((s) =>
        snapshotToDataPoint(s, range)
      );
      return [...dbPoints, ...livePoints];
    }
    // Historical only
    return dbReadings.map((r) => dbReadingToDataPoint(r, range));
  })();

  /* ── Merge alerts: live (NEW) on top, then DB ──── */
  const allAlerts: AlertItem[] = [
    ...liveAlerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      message: a.message,
      timestamp: a.timestamp,
      resolved: a.resolved,
      isNew: true,
    })),
    ...dbAlerts,
  ];

  /* ── Condition cards data ──────────────────────── */
  const conditions = [
    {
      icon: Thermometer,
      label: "Temperature",
      value: `${currentReading.temperature.toFixed(1)}°F`,
      type: "temperature" as const,
      raw: currentReading.temperature,
    },
    {
      icon: Droplets,
      label: "Humidity",
      value: `${currentReading.humidity.toFixed(1)}%`,
      type: "humidity" as const,
      raw: currentReading.humidity,
    },
    {
      icon: Waves,
      label: "Vibration",
      value: `${currentReading.vibration.toFixed(2)} mm/s`,
      type: "vibration" as const,
      raw: currentReading.vibration,
    },
    {
      icon: Sun,
      label: "Light",
      value: `${currentReading.lightLux.toFixed(1)} lux`,
      type: "light" as const,
      raw: currentReading.lightLux,
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-primary">
              Sentinel Monitor
            </h1>
            <p className="text-sm text-muted">
              Real-time environmental monitoring
            </p>
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ok" />
          </span>
          <span className="text-xs text-ok font-medium">LIVE</span>
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex gap-1 mb-6 bg-[#141416]/60 p-1 rounded-xl w-fit">
        {(["1H", "6H", "24H", "7D", "30D"] as TimeRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors duration-200 ${
              range === r
                ? "bg-gold/20 text-gold"
                : "text-muted hover:text-secondary"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Condition cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {conditions.map((c) => {
          const status = getConditionStatus(c.type, c.raw);
          return (
            <div key={c.type} className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: status.bgColor }}
                >
                  <c.icon size={18} style={{ color: status.color }} />
                </div>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    color: status.color,
                    backgroundColor: status.bgColor,
                  }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-xl font-semibold text-primary">{c.value}</p>
              <p className="text-xs text-muted mt-0.5">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* Loading state */}
      {loading && range !== "1H" && (
        <div className="glass-card p-8 mb-6 flex items-center justify-center gap-3">
          <Activity className="w-5 h-5 text-gold animate-spin" />
          <span className="text-sm text-secondary">
            Loading sensor data...
          </span>
        </div>
      )}

      {/* Charts */}
      {(!loading || range === "1H") && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <TemperatureChart data={chartData} />
          <HumidityChart data={chartData} />
          <VibrationGauge value={currentReading.vibration} />
          <LightIndicator value={currentReading.lightLux} />
        </div>
      )}

      {/* Alert list */}
      <AlertList alerts={allAlerts} />
    </div>
  );
}
