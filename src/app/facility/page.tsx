import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
  MapPin,
  Mountain,
  Zap,
  Flame,
  ClipboardCheck,
  CloudLightning,
  Wrench,
  FileSearch,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { FacilityEventType, Severity } from "@prisma/client";
import { MODEL_LABELS } from "@/lib/devices";
import { BatteryBar, ConnectivityPill } from "@/components/device-status-pill";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  operational: "text-ok bg-ok/10 border-ok/30",
  maintenance: "text-warn bg-warn/10 border-warn/30",
  offline: "text-danger bg-danger/10 border-danger/30",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  info: "text-info bg-info/10 border-info/30",
  warning: "text-warn bg-warn/10 border-warn/30",
  critical: "text-danger bg-danger/10 border-danger/30",
};

const EVENT_ICONS: Record<FacilityEventType, typeof CloudLightning> = {
  weather: CloudLightning,
  hurricane: CloudLightning,
  generator_test: Wrench,
  inspection: FileSearch,
  incident: AlertTriangle,
};

const EVENT_LABELS: Record<FacilityEventType, string> = {
  weather: "Weather",
  hurricane: "Hurricane",
  generator_test: "Generator test",
  inspection: "Inspection",
  incident: "Incident",
};

const PRIVATE_LOCATION_KIND_LABELS: Record<string, string> = {
  residence: "Residence",
  restaurant: "Restaurant",
  retail: "Retail",
  hospitality: "Hospitality",
  office: "Office",
  warehouse: "Warehouse",
  other: "Private location",
};

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function FacilityPage() {
  const ctx = await requireMemberFacility();
  if (!ctx) redirect("/auth/login");

  const facility = await prisma.facility.findUnique({
    where: { id: ctx.facilityId },
    include: {
      events: { orderBy: { startedAt: "desc" }, take: 25 },
      _count: { select: { lockers: true } },
      locationInstaller: true,
    },
  });
  if (!facility) redirect("/");

  if (facility.type === "private_location") {
    const certified = Boolean(facility.privateLocationCertifiedAt);
    const installer = facility.locationInstaller;

    const devices = await prisma.sentinelDevice.findMany({
      where: { facilityId: facility.id, retiredAt: null },
      orderBy: [{ installedAt: "desc" }, { createdAt: "desc" }],
      take: 25,
      select: {
        id: true,
        serialNumber: true,
        model: true,
        connectivity: true,
        batteryPct: true,
        installedAt: true,
        lastHeartbeatAt: true,
        retiredAt: true,
      },
    });

    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h1 className="font-serif text-2xl text-primary">
                {facility.name}
              </h1>
              <p className="text-sm text-muted">
                {PRIVATE_LOCATION_KIND_LABELS[
                  facility.privateLocationKind ?? "other"
                ] ?? "Private location"}{" "}
                · {facility.location}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/settings/locations"
              className="inline-flex items-center min-h-[32px] px-3 rounded-full border border-[#2A2A30] text-xs text-secondary hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
            >
              Edit location
            </Link>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${
                certified
                  ? "bg-gold/10 text-gold border-gold/30"
                  : "bg-warn/10 text-warn border-warn/30"
              }`}
            >
              {certified ? "Caveau Certified" : "Pending certification"}
            </span>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8 mb-6">
          <h2 className="font-serif text-lg text-primary mb-1">
            Private Location Monitoring
          </h2>
          <p className="text-xs text-muted mb-5">
            Sentinel monitoring for client-controlled storage. Caveau vaults
            remain the system of record for custody documentation.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Certification
              </p>
              <p className="font-serif text-xl text-primary mt-1">
                {certified ? "Certified" : "In progress"}
              </p>
              <p className="text-xs text-muted mt-1">
                {facility.privateLocationCertifiedAt
                  ? `Certified ${formatDate(facility.privateLocationCertifiedAt)}`
                  : "Installer visit required to activate certification."}
              </p>
            </div>

            <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Installation partner
              </p>
              {installer ? (
                <>
                  <p className="font-serif text-xl text-primary mt-1">
                    {installer.name}
                  </p>
                  <p className="text-xs text-muted mt-1">
                    {installer.company ? installer.company : "Caveau partner"}
                    {installer.region ? ` · ${installer.region}` : ""}
                  </p>
                  {(installer.email || installer.phone) && (
                    <p className="text-xs text-secondary mt-2">
                      {installer.email ? installer.email : ""}
                      {installer.email && installer.phone ? " · " : ""}
                      {installer.phone ? installer.phone : ""}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-serif text-xl text-primary mt-1">—</p>
                  <p className="text-xs text-muted mt-1">
                    Not assigned yet.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[#2A2A30]/50 bg-[#0F0F10]/60 p-5">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Sentinel
              </p>
              <p className="font-serif text-xl text-primary mt-1">
                {devices.length}
              </p>
              <p className="text-xs text-muted mt-1">
                {devices.length === 1 ? "Device" : "Devices"} registered
              </p>
              <Link
                href="/sentinel"
                className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold-text mt-3 transition-colors"
              >
                View monitoring <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 md:p-8">
          <h2 className="font-serif text-lg text-primary mb-1">
            Devices
          </h2>
          <p className="text-xs text-muted mb-5">
            Environmental sensors installed at this private location.
          </p>

          {devices.length === 0 ? (
            <p className="text-sm text-muted italic">
              No devices registered for this private location yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-[#2A2A30]/60">
                    <th className="px-2 py-3 font-medium">Serial</th>
                    <th className="px-2 py-3 font-medium">Model</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Battery</th>
                    <th className="px-2 py-3 font-medium">Last heartbeat</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-[#2A2A30]/40 last:border-b-0"
                    >
                      <td className="px-2 py-3 text-primary font-medium tabular-nums">
                        {d.serialNumber}
                      </td>
                      <td className="px-2 py-3 text-secondary">
                        {MODEL_LABELS[d.model]}
                      </td>
                      <td className="px-2 py-3">
                        <ConnectivityPill device={d} />
                      </td>
                      <td className="px-2 py-3">
                        <BatteryBar batteryPct={d.batteryPct} />
                      </td>
                      <td className="px-2 py-3 text-secondary whitespace-nowrap">
                        {d.lastHeartbeatAt
                          ? formatRelativeTime(d.lastHeartbeatAt)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  const generatorClass =
    STATUS_STYLES[facility.generatorStatus] ?? STATUS_STYLES.operational;
  const fireClass =
    STATUS_STYLES[facility.fireSuppressionStatus] ?? STATUS_STYLES.operational;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">{facility.name}</h1>
          <p className="text-sm text-muted">
            {facility.location} · {facility._count.lockers} locker
            {facility._count.lockers === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Resilience grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Mountain className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Elevation
            </p>
          </div>
          <p className="font-serif text-2xl text-primary">
            {facility.elevationFt != null ? `${facility.elevationFt} ft` : "—"}
          </p>
          <p className="text-xs text-muted mt-1">Above sea level</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Generator
            </p>
          </div>
          <span
            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${generatorClass}`}
          >
            {statusLabel(facility.generatorStatus)}
          </span>
          <p className="text-xs text-muted mt-2">Kohler 150 kW standby</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Flame className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Fire suppression
            </p>
          </div>
          <span
            className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium border ${fireClass}`}
          >
            {statusLabel(facility.fireSuppressionStatus)}
          </span>
          <p className="text-xs text-muted mt-2">FM-200 clean agent</p>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardCheck className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Last inspection
            </p>
          </div>
          <p className="font-serif text-lg text-primary">
            {facility.lastInspectionAt
              ? formatDate(facility.lastInspectionAt)
              : "—"}
          </p>
          <p className="text-xs text-muted mt-1">
            {facility.lastInspectionAt
              ? formatRelativeTime(facility.lastInspectionAt)
              : "No record"}
          </p>
        </div>
      </div>

      {/* Event log */}
      <div className="glass-card p-6 md:p-8">
        <h2 className="font-serif text-lg text-primary mb-1">Event log</h2>
        <p className="text-xs text-muted mb-6">
          Weather, resilience tests, and incidents logged against this facility.
          Click any event to see the auto-generated environmental report for
          your cellar during that window.
        </p>

        {facility.events.length === 0 ? (
          <p className="text-sm text-muted italic">
            No events logged for this facility yet.
          </p>
        ) : (
          <ul className="divide-y divide-[#2A2A30]/50">
            {facility.events.map((event) => {
              const Icon = EVENT_ICONS[event.type];
              return (
                <li key={event.id}>
                  <Link
                    href={`/facility/events/${event.id}`}
                    className="flex items-start gap-4 py-4 -mx-2 px-2 rounded-xl hover:bg-[#1C1C20]/60 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#1C1C20]/80 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-primary font-medium">
                          {EVENT_LABELS[event.type]}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${SEVERITY_STYLES[event.severity]}`}
                        >
                          {event.severity}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(event.startedAt)}
                          {event.endedAt &&
                          event.endedAt.getTime() !== event.startedAt.getTime()
                            ? ` – ${formatDate(event.endedAt)}`
                            : ""}
                        </span>
                      </div>
                      {event.notes && (
                        <p className="text-xs text-secondary mt-1 line-clamp-2">
                          {event.notes}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted shrink-0 mt-2" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
