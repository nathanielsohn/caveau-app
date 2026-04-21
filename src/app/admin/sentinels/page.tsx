import Link from "next/link";
import { Cpu } from "lucide-react";
import type { Prisma, SentinelConnectivity } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";
import {
  LATEST_FIRMWARE,
  MODEL_LABELS,
  needsAttention,
} from "@/lib/devices";
import {
  BatteryBar,
  ConnectivityPill,
} from "@/components/device-status-pill";
import { tierSpecForDbTier } from "@/lib/tiers";

export const dynamic = "force-dynamic";

type ConnectivityFilter = "all" | SentinelConnectivity | "needs_attention";

function resolveConnectivity(raw: string | undefined): ConnectivityFilter {
  if (raw === "wifi" || raw === "lte_m" || raw === "offline") return raw;
  if (raw === "needs_attention") return raw;
  return "all";
}

const CONNECTIVITY_FILTERS: { value: ConnectivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "wifi", label: "WiFi" },
  { value: "lte_m", label: "LTE-M" },
  { value: "offline", label: "Offline" },
  { value: "needs_attention", label: "Needs attention" },
];

export default async function AdminSentinelsPage({
  searchParams,
}: {
  searchParams: Promise<{ facility?: string; connectivity?: string }>;
}) {
  const params = await searchParams;
  const facilityFilter = params.facility;
  const connectivityFilter = resolveConnectivity(params.connectivity);

  const where: Prisma.SentinelDeviceWhereInput = {};
  if (facilityFilter) where.facilityId = facilityFilter;
  if (
    connectivityFilter === "wifi" ||
    connectivityFilter === "lte_m" ||
    connectivityFilter === "offline"
  ) {
    where.connectivity = connectivityFilter;
  }

  const [devices, facilities, totalCount] = await Promise.all([
    prisma.sentinelDevice.findMany({
      where,
      orderBy: [{ retiredAt: "asc" }, { lastHeartbeatAt: "desc" }],
      include: {
        facility: { select: { id: true, name: true } },
        locker: { select: { lockerNumber: true, zone: true } },
        member: { select: { id: true, name: true, tier: true } },
        wine: { select: { id: true, name: true, vintage: true } },
      },
    }),
    prisma.facility.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.sentinelDevice.count(),
  ]);

  // "Needs attention" composes with the connectivity-enum filter — we
  // apply it post-query because the attention predicate mixes battery,
  // firmware, and staleness, which don't fold into a single WHERE.
  const filteredDevices =
    connectivityFilter === "needs_attention"
      ? devices.filter((d) => needsAttention(d))
      : devices;

  const attentionCount = devices.filter((d) => needsAttention(d)).length;
  const onlineCount = devices.filter(
    (d) => d.connectivity !== "offline" && !d.retiredAt && d.installedAt,
  ).length;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Cpu className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Sentinel fleet</h1>
          <p className="text-sm text-muted">
            {totalCount} devices · {onlineCount} online · {attentionCount} need
            attention
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5">
        {facilities.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-muted mr-1">
              Facility
            </span>
            <FacilityChip
              label="All"
              href={buildHref(undefined, connectivityFilter)}
              active={!facilityFilter}
            />
            {facilities.map((f) => (
              <FacilityChip
                key={f.id}
                label={f.name}
                href={buildHref(f.id, connectivityFilter)}
                active={facilityFilter === f.id}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap md:ml-auto">
          {CONNECTIVITY_FILTERS.map((f) => (
            <Link
              key={f.value}
              href={buildHref(facilityFilter, f.value)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                connectivityFilter === f.value
                  ? "bg-gold/10 border-gold/40 text-gold"
                  : "border-[#2A2A30] text-secondary hover:text-primary"
              }`}
            >
              {f.label}
              {f.value === "needs_attention" && attentionCount > 0 && (
                <span className="text-[10px] text-danger">{attentionCount}</span>
              )}
            </Link>
          ))}
        </div>
      </div>

      {filteredDevices.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No devices match this filter.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-[#2A2A30]/60">
                  <th className="px-4 py-3 font-medium">Serial</th>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Assigned to</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Battery</th>
                  <th className="px-4 py-3 font-medium">Firmware</th>
                  <th className="px-4 py-3 font-medium">Last heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((d) => {
                  const location = d.lockerId
                    ? `${d.facility.name} · Locker #${d.locker?.lockerNumber}`
                    : d.retiredAt
                      ? `${d.facility.name} · Retired`
                      : `${d.facility.name} · Pool`;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-[#2A2A30]/40 last:border-b-0 hover:bg-[#1C1C20]/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/sentinels/${d.id}`}
                          className="text-primary hover:text-gold font-medium transition-colors"
                        >
                          {d.serialNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-secondary">
                        {MODEL_LABELS[d.model]}
                      </td>
                      <td className="px-4 py-3 text-secondary">{location}</td>
                      <td className="px-4 py-3 text-secondary">
                        {d.member ? (
                          <>
                            <span className="text-primary">{d.member.name}</span>
                            {d.bundledWithTier && (
                              <span className="block text-[10px] uppercase tracking-wider text-gold-text mt-0.5">
                                Bundled · {tierSpecForDbTier(d.bundledWithTier).name}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ConnectivityPill device={d} />
                      </td>
                      <td className="px-4 py-3">
                        <BatteryBar batteryPct={d.batteryPct} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-secondary tabular-nums">
                          {d.firmwareVersion}
                        </span>
                        {d.firmwareVersion !== LATEST_FIRMWARE && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-gold">
                            Update
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-secondary whitespace-nowrap">
                        {d.lastHeartbeatAt
                          ? formatRelativeTime(d.lastHeartbeatAt)
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filteredDevices.map((d) => (
              <Link
                key={d.id}
                href={`/admin/sentinels/${d.id}`}
                className="glass-card p-4 block"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-primary font-medium truncate">
                      {d.serialNumber}
                    </p>
                    <p className="text-xs text-muted">
                      {MODEL_LABELS[d.model]} · {d.facility.name}
                    </p>
                  </div>
                  <ConnectivityPill device={d} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <BatteryBar batteryPct={d.batteryPct} />
                  <span className="text-xs text-muted tabular-nums">
                    {d.lastHeartbeatAt
                      ? formatRelativeTime(d.lastHeartbeatAt)
                      : "Never"}
                  </span>
                </div>
                {d.member && (
                  <p className="text-xs text-secondary mt-2 truncate">
                    {d.member.name}
                    {d.bundledWithTier && (
                      <span className="text-gold-text">
                        {" · "}
                        Bundled · {tierSpecForDbTier(d.bundledWithTier).name}
                      </span>
                    )}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FacilityChip({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
        active
          ? "bg-gold/10 border-gold/40 text-gold"
          : "border-[#2A2A30] text-secondary hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );
}

function buildHref(
  facilityId: string | undefined,
  connectivity: ConnectivityFilter,
): string {
  const params = new URLSearchParams();
  if (facilityId) params.set("facility", facilityId);
  if (connectivity !== "all") params.set("connectivity", connectivity);
  const query = params.toString();
  return query ? `/admin/sentinels?${query}` : "/admin/sentinels";
}
