"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Thermometer,
  Droplets,
  Waves,
  DoorOpen,
  Activity,
  Shield,
} from "lucide-react";
import { simulateReading, checkThresholds } from "@/lib/sensors";
import type { SensorSnapshot, LiveAlert } from "@/lib/sensors";
import {
  TemperatureChart,
  HumidityChart,
  VibrationGauge,
  AccessLog,
} from "@/components/sensor-charts";
import type { SensorDataPoint } from "@/components/sensor-charts";
import AlertList from "@/components/alert-list";
import { FacilityPill } from "@/components/facility-context";
import type { AlertItem } from "@/components/alert-list";
import { fetchSentinelData, recordLiveAlert } from "./actions";
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

/** Max live readings to keep in memory (1 hour at 5s intervals = 720) */
const MAX_LIVE_READINGS = 720;

/* ── Helpers ───────────────────────────────────────── */

function formatTimestamp(date: Date | string, range: TimeRange): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (range === "1H" || range === "6H" || range === "24H") {
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
  type: "temperature" | "humidity" | "vibration" | "access",
  value: number
): { label: string; color: string; bgColor: string } {
  const red = { label: "Critical", color: "#F87171", bgColor: "rgba(248, 113, 113, 0.125)" };
  const yellow = { label: "Warning", color: "#FBBF24", bgColor: "rgba(251, 191, 36, 0.125)" };
  const green = { label: "Normal", color: "#34D399", bgColor: "rgba(52, 211, 153, 0.125)" };

  if (type === "temperature") {
    if (value > THRESHOLDS.temp.max || value < THRESHOLDS.temp.min)
      return red;
    if (value > THRESHOLDS.temp.max - 2 || value < THRESHOLDS.temp.min + 2)
      return yellow;
    return green;
  }
  if (type === "humidity") {
    if (value > THRESHOLDS.humidity.max || value < THRESHOLDS.humidity.min)
      return { ...yellow };
    return { ...green };
  }
  if (type === "vibration") {
    if (value > THRESHOLDS.vibration.max)
      return { ...red, label: "High" };
    if (value > 0.3)
      return { ...yellow, label: "Elevated" };
    return { ...green };
  }
  // access — value represents hours since last access
  if (value < 1)
    return { label: "Recent", color: "#60A5FA", bgColor: "rgba(96, 165, 250, 0.125)" };
  return { ...green, label: "Secured" };
}

/* ── Page Component ────────────────────────────────── */

export default function SentinelPage() {
  const [range, setRange] = useState<TimeRange>("1H");
  const [liveReadings, setLiveReadings] = useState<SensorSnapshot[]>([]);
  const [dbReadings, setDbReadings] = useState<DbSensorReading[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<LiveAlert[]>([]);
  const [dbAlerts, setDbAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLocker, setHasLocker] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Client-side dedupe for persisted live alerts: keeps the last time we
  // sent a given alert type up to the server. Prevents every 5-second tick
  // from spawning a DB write + email attempt while the breach persists.
  // Server-side `notifyAlert` enforces its own cooldown too; this is just a
  // cheap client guard so we don't hammer the action.
  const lastPersistedRef = useRef<Map<string, number>>(new Map());
  const PERSIST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  // Current reading is the latest live reading or a fresh simulated one
  const currentReading =
    liveReadings.length > 0
      ? liveReadings[liveReadings.length - 1]
      : simulateReading();

  /* ── Fetch DB data ─────────────────────────────── */
  const loadDbData = useCallback(async (selectedRange: TimeRange) => {
    setLoading(true);
    setError(null);
    try {
      const { readings, alerts, hasLocker: lockerPresent } =
        await fetchSentinelData(TIME_RANGE_HOURS[selectedRange]);
      setDbReadings(readings);
      setDbAlerts(alerts.map((a) => ({ ...a, isNew: false })));
      setHasLocker(lockerPresent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensor data");
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Initial load + range changes ──────────────── */
  useEffect(() => {
    void loadDbData(range);
  }, [range, loadDbData]);

  /* ── Live simulation (runs always for current values) */
  // The tick closure is held in a ref so the 5-second setInterval below
  // always sees the latest state-setters without having to restart the
  // timer on every render. Assigning the ref lives in a useLayoutEffect
  // rather than in the render body — reassigning refs during render
  // breaks under strict mode / concurrent rendering because the render
  // runs twice and the second pass can overwrite the first.
  const tickRef = useRef(() => {});
  useLayoutEffect(() => {
    tickRef.current = () => {
      const reading = simulateReading();
      setLiveReadings((prev) => {
        const updated = [...prev, reading];
        return updated.length > MAX_LIVE_READINGS
          ? updated.slice(-MAX_LIVE_READINGS)
          : updated;
      });

      // Check for threshold breaches
      const newAlerts = checkThresholds(reading);
      if (newAlerts.length > 0) {
        setLiveAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));

        // Persist + notify: one server call per alert type per cooldown window.
        const now = Date.now();
        for (const a of newAlerts) {
          const key = `${a.type}:${a.severity}`;
          const last = lastPersistedRef.current.get(key) ?? 0;
          if (now - last < PERSIST_COOLDOWN_MS) continue;
          lastPersistedRef.current.set(key, now);
          void recordLiveAlert({
            type: a.type,
            severity: a.severity,
            message: a.message,
          }).catch(() => {
            // Non-fatal: the in-memory alert is still shown to the user. We
            // deliberately swallow silently rather than surfacing a toast for
            // every failed tick — the server will also enforce its own cooldown.
          });
        }
      }
    };
  });

  useEffect(() => {
    // Generate initial reading
    const initial = simulateReading();
    setLiveReadings([initial]);

    const start = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => tickRef.current(), 5000);
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    // Pause the 5s simulation tick when the tab is hidden — iOS backgrounds
    // throttle setInterval anyway and running it wastes battery + fires
    // threshold alerts the user can't see.
    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, []);

  /* ── Build chart data based on selected range ──── */
  const chartData = useMemo<SensorDataPoint[]>(() => {
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
  }, [range, dbReadings, liveReadings]);

  /* ── Merge alerts: live (NEW) on top, then DB ──── */
  const allAlerts: AlertItem[] = useMemo(
    () => [
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
    ],
    [liveAlerts, dbAlerts],
  );

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
      icon: DoorOpen,
      label: "Access",
      value: "2h ago",
      type: "access" as const,
      raw: 2,
    },
  ];

  return (
    <div className="px-4 md:px-8 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center justify-between gap-3">
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
          <FacilityPill />
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

      {/* Time range selector — a radio group is the correct pattern here
          (the content below isn't split into real tab panels) and it gets
          arrow-key navigation for free from assistive tech. */}
      <div
        className="flex gap-1 mb-6 bg-[#141416]/60 p-1 rounded-xl w-fit"
        role="radiogroup"
        aria-label="Time range"
      >
        {(["1H", "6H", "24H", "7D", "30D"] as TimeRange[]).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 min-h-[44px] min-w-[44px] text-xs font-medium rounded-lg transition-colors duration-200 flex items-center justify-center ${
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-6" aria-live="polite" aria-atomic="true">
        {conditions.map((c) => {
          const status = getConditionStatus(c.type, c.raw);
          return (
            <div key={c.type} className="glass-card p-3 sm:p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: status.bgColor }}
                >
                  <c.icon size={18} style={{ color: status.color }} />
                </div>
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full truncate"
                  style={{
                    color: status.color,
                    backgroundColor: status.bgColor,
                  }}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-lg sm:text-xl font-semibold text-primary tabular-nums">{c.value}</p>
              <p className="text-xs text-muted mt-0.5">{c.label}</p>
            </div>
          );
        })}
      </div>

      {/* No-locker state — facility has no locker assigned to this member */}
      {!hasLocker && !loading && !error && (
        <div className="glass-card p-6 mb-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-center border-warn/30">
          <Shield className="w-5 h-5 text-warn" />
          <span className="text-sm text-secondary">
            No locker reserved at this facility yet. The live charts below are a
            simulation only — switch facilities or reserve a locker to see real
            sensor history.
          </span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="glass-card p-8 mb-6 flex items-center justify-center gap-3 border-danger/30">
          <Activity className="w-5 h-5 text-danger" />
          <span className="text-sm text-danger">{error}</span>
          <button
            onClick={() => loadDbData(range)}
            className="text-xs text-gold hover:text-gold-text transition-colors ml-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !error && range !== "1H" && (
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
          <AccessLog />
        </div>
      )}

      {/* Alert list */}
      <AlertList alerts={allAlerts} />
    </div>
  );
}
