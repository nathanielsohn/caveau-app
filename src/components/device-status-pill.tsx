import { Wifi, Signal, WifiOff, PauseCircle, Archive } from "lucide-react";
import type { SentinelConnectivity } from "@prisma/client";
import { effectiveConnectivity, isBatteryLow } from "@/lib/devices";

type State = SentinelConnectivity | "retired" | "pool";

const STYLES: Record<State, string> = {
  wifi: "bg-ok/10 text-ok border-ok/30",
  lte_m: "bg-gold/10 text-gold border-gold/30",
  offline: "bg-danger/10 text-danger border-danger/30",
  retired: "bg-muted/10 text-muted border-muted/20",
  pool: "bg-[#1C1C20] text-secondary border-[#2A2A30]",
};

const LABELS: Record<State, string> = {
  wifi: "WiFi",
  lte_m: "LTE-M",
  offline: "Offline",
  retired: "Retired",
  pool: "Ready for install",
};

const ICONS: Record<State, typeof Wifi> = {
  wifi: Wifi,
  lte_m: Signal,
  offline: WifiOff,
  retired: Archive,
  pool: PauseCircle,
};

export function ConnectivityPill({
  device,
}: {
  device: {
    retiredAt: Date | null;
    connectivity: SentinelConnectivity;
    lastHeartbeatAt: Date | null;
    installedAt: Date | null;
  };
}) {
  const state = effectiveConnectivity(device);
  const Icon = ICONS[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-medium ${STYLES[state]}`}
    >
      <Icon size={12} strokeWidth={2} />
      {LABELS[state]}
    </span>
  );
}

export function BatteryBar({ batteryPct }: { batteryPct: number | null }) {
  if (batteryPct === null) {
    return <span className="text-xs text-muted">—</span>;
  }
  const low = isBatteryLow(batteryPct);
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 rounded-full bg-[#1C1C20] overflow-hidden">
        <div
          className={`h-full ${low ? "bg-danger" : batteryPct < 50 ? "bg-gold" : "bg-ok"}`}
          style={{ width: `${Math.max(4, batteryPct)}%` }}
        />
      </div>
      <span
        className={`text-xs tabular-nums ${low ? "text-danger" : "text-secondary"}`}
      >
        {batteryPct}%
      </span>
    </div>
  );
}
