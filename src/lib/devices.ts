import {
  SentinelConnectivity,
  SentinelModel,
  type SentinelDevice,
} from "@prisma/client";

/**
 * Sentinel fleet helpers (feature #58).
 *
 * Single source of truth for what counts as "stale," "low battery," and
 * "latest firmware." Hardcoding `LATEST_FIRMWARE` here rather than
 * a DB table matches demo scale — one release cadence, one value.
 */

// A device without a heartbeat in the last 24h gets the stale badge.
// Real Sentinels check in every few seconds; anything past a day is
// almost certainly offline, a bad battery, or a radio fault.
export const STALE_HEARTBEAT_MS = 24 * 60 * 60 * 1000;

// Below this the admin sees the red "needs charging/replacement" pill.
export const LOW_BATTERY_PCT = 20;

// Current shipping firmware. Bump this const when a new build ships; the
// fleet view compares every device's `firmwareVersion` against it to
// surface the "update available" badge.
export const LATEST_FIRMWARE = "2.4.1";

export const CONNECTIVITY_LABELS: Record<SentinelConnectivity, string> = {
  wifi: "WiFi",
  lte_m: "LTE-M",
  offline: "Offline",
};

export const MODEL_LABELS: Record<SentinelModel, string> = {
  sentinel_locker: "Sentinel (locker)",
  bottle_probe: "Bottle Probe",
};

export function isHeartbeatStale(
  lastHeartbeatAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!lastHeartbeatAt) return true;
  return now.getTime() - lastHeartbeatAt.getTime() > STALE_HEARTBEAT_MS;
}

export function isBatteryLow(batteryPct: number | null): boolean {
  return batteryPct !== null && batteryPct < LOW_BATTERY_PCT;
}

export function isFirmwareStale(firmwareVersion: string): boolean {
  return firmwareVersion !== LATEST_FIRMWARE;
}

/**
 * Returns true when the admin fleet page should flag the device for
 * review. Retired devices never flag — operators have already written
 * them off. Inventory-pool units (no lockerId/memberId) don't flag on
 * stale heartbeat because they haven't been installed yet.
 */
export function needsAttention(
  device: Pick<
    SentinelDevice,
    "retiredAt" | "lastHeartbeatAt" | "batteryPct" | "firmwareVersion" | "installedAt"
  >,
  now: Date = new Date(),
): boolean {
  if (device.retiredAt) return false;
  if (isBatteryLow(device.batteryPct)) return true;
  if (isFirmwareStale(device.firmwareVersion)) return true;
  if (device.installedAt && isHeartbeatStale(device.lastHeartbeatAt, now)) {
    return true;
  }
  return false;
}

/**
 * Pick the connectivity badge that matches a device's current state.
 * `retired` overrides everything else so a retired device doesn't look
 * like it might still be online.
 */
export function effectiveConnectivity(
  device: Pick<SentinelDevice, "retiredAt" | "connectivity" | "lastHeartbeatAt" | "installedAt">,
  now: Date = new Date(),
): SentinelConnectivity | "retired" | "pool" {
  if (device.retiredAt) return "retired";
  if (!device.installedAt) return "pool";
  if (isHeartbeatStale(device.lastHeartbeatAt, now)) return "offline";
  return device.connectivity;
}
