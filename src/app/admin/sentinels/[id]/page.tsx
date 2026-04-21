import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime, formatDate } from "@/lib/utils";
import {
  LATEST_FIRMWARE,
  MODEL_LABELS,
  CONNECTIVITY_LABELS,
} from "@/lib/devices";
import {
  BatteryBar,
  ConnectivityPill,
} from "@/components/device-status-pill";
import { tierSpecForDbTier } from "@/lib/tiers";
import ActionsPanel from "./actions-panel";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  installed: "Installed",
  firmware_updated: "Firmware updated",
  reassigned: "Reassigned",
  retired: "Retired",
  heartbeat_gap: "Heartbeat gap",
  battery_low: "Battery low",
  connectivity_changed: "Connectivity changed",
  test_ping: "Test ping",
};

export default async function SentinelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const device = await prisma.sentinelDevice.findUnique({
    where: { id },
    include: {
      facility: { select: { id: true, name: true } },
      locker: {
        select: { id: true, lockerNumber: true, zone: true },
      },
      member: { select: { id: true, name: true, tier: true, email: true } },
      wine: { select: { id: true, name: true, vintage: true, producer: true } },
      events: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          actor: { select: { name: true } },
        },
      },
    },
  });

  if (!device) notFound();

  const [facilityLockers, facilityMembersRaw, recentReadings] = await Promise.all([
    prisma.locker.findMany({
      where: { facilityId: device.facilityId },
      orderBy: { lockerNumber: "asc" },
      select: { id: true, lockerNumber: true, zone: true },
    }),
    prisma.facilityMember.findMany({
      where: { facilityId: device.facilityId },
      include: { member: { select: { id: true, name: true } } },
    }),
    device.lockerId
      ? prisma.sensorReading.findMany({
          where: device.model === "bottle_probe"
            ? { deviceId: device.id }
            : { lockerId: device.lockerId },
          orderBy: { timestamp: "desc" },
          take: 5,
          select: {
            id: true,
            temperature: true,
            humidity: true,
            vibration: true,
            timestamp: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const facilityMembers = facilityMembersRaw
    .map((fm) => fm.member)
    .sort((a, b) => a.name.localeCompare(b.name));

  const firmwareStale = device.firmwareVersion !== LATEST_FIRMWARE;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <Link
        href="/admin/sentinels"
        className="inline-flex items-center gap-1 text-sm text-secondary hover:text-primary mb-4"
      >
        <ChevronLeft size={16} />
        Back to fleet
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl text-primary">
            {device.serialNumber}
          </h1>
          <p className="text-sm text-muted">
            {MODEL_LABELS[device.model]} · {device.facility.name}
            {device.hardwareRev ? ` · Rev ${device.hardwareRev}` : ""}
          </p>
        </div>
        <ConnectivityPill device={device} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Status summary */}
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
            Status
          </p>
          <dl className="text-sm space-y-2">
            <Row label="Connectivity">
              <span className="text-primary">
                {CONNECTIVITY_LABELS[device.connectivity]}
              </span>
            </Row>
            <Row label="Battery">
              <BatteryBar batteryPct={device.batteryPct} />
            </Row>
            <Row label="Firmware">
              <span className="text-primary tabular-nums">
                {device.firmwareVersion}
              </span>
              {firmwareStale && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                  Update to {LATEST_FIRMWARE}
                </span>
              )}
            </Row>
            <Row label="Last heartbeat">
              <span className="text-primary">
                {device.lastHeartbeatAt
                  ? `${formatRelativeTime(device.lastHeartbeatAt)} · ${formatDate(device.lastHeartbeatAt)}`
                  : "Never"}
              </span>
            </Row>
          </dl>
        </div>

        {/* Assignment */}
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
            Assignment
          </p>
          <dl className="text-sm space-y-2">
            <Row label="Facility">
              <span className="text-primary">{device.facility.name}</span>
            </Row>
            <Row label="Locker">
              <span className="text-primary">
                {device.locker
                  ? `#${device.locker.lockerNumber} · Zone ${device.locker.zone}`
                  : device.retiredAt
                    ? "—"
                    : "Pool"}
              </span>
            </Row>
            <Row label="Member">
              {device.member ? (
                <span className="text-primary">{device.member.name}</span>
              ) : (
                <span className="text-muted">Unassigned</span>
              )}
            </Row>
            {device.wine && (
              <Row label="Paired with">
                <span className="text-primary">
                  {device.wine.vintage} {device.wine.name}
                </span>
              </Row>
            )}
            <Row label="Source">
              <span className="text-primary">
                {device.bundledWithTier
                  ? `Bundled · ${tierSpecForDbTier(device.bundledWithTier).name} tier`
                  : "Purchased outright"}
              </span>
              {device.purchasedAt && (
                <span className="text-xs text-muted block">
                  {formatDate(device.purchasedAt)}
                </span>
              )}
            </Row>
            {device.installedAt && (
              <Row label="Installed">
                <span className="text-primary">
                  {formatDate(device.installedAt)}
                </span>
              </Row>
            )}
            {device.retiredAt && (
              <Row label="Retired">
                <span className="text-danger">
                  {formatDate(device.retiredAt)}
                </span>
              </Row>
            )}
          </dl>
        </div>
      </div>

      {/* Recent readings */}
      {recentReadings.length > 0 && (
        <div className="glass-card p-5 mb-5">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
            Recent readings
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-[#2A2A30]/50">
                  <th className="px-2 py-2 font-medium">When</th>
                  <th className="px-2 py-2 font-medium">Temp</th>
                  <th className="px-2 py-2 font-medium">Humidity</th>
                  <th className="px-2 py-2 font-medium">Vibration</th>
                </tr>
              </thead>
              <tbody>
                {recentReadings.map((r) => (
                  <tr key={r.id} className="border-b border-[#2A2A30]/40 last:border-0">
                    <td className="px-2 py-2 text-secondary tabular-nums">
                      {formatRelativeTime(r.timestamp)}
                    </td>
                    <td className="px-2 py-2 text-primary tabular-nums">
                      {Number(r.temperature).toFixed(1)}°F
                    </td>
                    <td className="px-2 py-2 text-primary tabular-nums">
                      {Number(r.humidity).toFixed(1)}%
                    </td>
                    <td className="px-2 py-2 text-primary tabular-nums">
                      {Number(r.vibration).toFixed(3)} mm/s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mb-5">
        <ActionsPanel
          deviceId={device.id}
          currentLockerId={device.lockerId}
          currentMemberId={device.memberId}
          currentFirmware={device.firmwareVersion}
          retired={Boolean(device.retiredAt)}
          facilityLockers={facilityLockers}
          facilityMembers={facilityMembers}
        />
      </div>

      {/* Event log */}
      <div className="glass-card p-5">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
          Event log
        </p>
        {device.events.length === 0 ? (
          <p className="text-sm text-muted">No events recorded yet.</p>
        ) : (
          <ul className="divide-y divide-[#2A2A30]/40">
            {device.events.map((e) => (
              <li key={e.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary">
                    {EVENT_LABELS[e.type] ?? e.type}
                    {e.actor?.name && (
                      <span className="text-xs text-muted">
                        {" · "}by {e.actor.name}
                      </span>
                    )}
                  </p>
                  {e.payload && (
                    <p className="text-xs text-muted mt-0.5 font-mono truncate">
                      {JSON.stringify(e.payload)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted shrink-0 whitespace-nowrap">
                  {formatRelativeTime(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right min-w-0">{children}</dd>
    </div>
  );
}
