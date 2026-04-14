import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck,
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
    },
  });
  if (!facility) redirect("/");

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
