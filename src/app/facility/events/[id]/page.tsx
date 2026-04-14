import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ShieldCheck,
  ArrowLeft,
  Thermometer,
  Droplets,
  Clock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMemberFacility } from "@/lib/current-facility";
import { buildEventReport } from "../actions";
import { formatDate, formatTemp, formatHumidity } from "@/lib/utils";
import type { FacilityEventType, Severity } from "@prisma/client";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<FacilityEventType, string> = {
  weather: "Weather Event",
  hurricane: "Hurricane",
  generator_test: "Generator Test",
  inspection: "Facility Inspection",
  incident: "Incident",
};

const SEVERITY_STYLES: Record<Severity, string> = {
  info: "text-info bg-info/10 border-info/30",
  warning: "text-warn bg-warn/10 border-warn/30",
  critical: "text-danger bg-danger/10 border-danger/30",
};

export default async function FacilityEventReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireMemberFacility();
  if (!ctx) redirect("/auth/login");

  const { id } = await params;
  const event = await prisma.facilityEvent.findUnique({
    where: { id },
    include: { facility: true },
  });
  if (!event) notFound();

  // Ownership: the event must belong to the member's current facility.
  // Anything else is treated as a 404 to avoid leaking which facility
  // ids exist.
  if (event.facilityId !== ctx.facilityId) notFound();

  const report = await buildEventReport(event.id);
  if (!report) notFound();

  const durationHours = Math.max(
    1,
    Math.round(
      ((event.endedAt ?? event.startedAt).getTime() -
        event.startedAt.getTime()) /
        3600000,
    ),
  );

  const safe = report.alertCount === 0;

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/facility"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to facility
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">
            {EVENT_LABELS[event.type]} Report
          </h1>
          <p className="text-sm text-muted">
            {event.facility.name} · {formatDate(event.startedAt)}
            {event.endedAt && event.endedAt.getTime() !== event.startedAt.getTime()
              ? ` – ${formatDate(event.endedAt)}`
              : ""}
          </p>
        </div>
        <span
          className={`ml-auto px-2.5 py-1 rounded-full text-xs font-medium border ${SEVERITY_STYLES[event.severity]}`}
        >
          {event.severity}
        </span>
      </div>

      {/* Headline summary */}
      <div className="glass-card p-6 md:p-8 mb-6">
        <p className="font-serif text-xl text-primary leading-snug">
          {safe
            ? `Your cellar was safe during ${EVENT_LABELS[event.type].toLowerCase()}.`
            : `${report.alertCount} environmental alert${report.alertCount === 1 ? "" : "s"} were logged during this event.`}
        </p>
        <p className="text-sm text-secondary mt-3">
          {safe
            ? `Sentinel monitored ${report.lockerCount} of your locker${report.lockerCount === 1 ? "" : "s"} continuously for ${durationHours} hours. Temperature and humidity stayed within spec throughout.`
            : `Sentinel flagged ${report.alertCount} threshold breach${report.alertCount === 1 ? "" : "es"} across ${report.lockerCount} of your locker${report.lockerCount === 1 ? "" : "s"} during the ${durationHours}-hour window. See the environmental summary below.`}
        </p>
        {event.notes && (
          <p className="text-xs text-muted italic mt-4 pt-4 border-t border-[#2A2A30]/60">
            Operator note: {event.notes}
          </p>
        )}
      </div>

      {/* Environmental summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Temperature
            </p>
          </div>
          {report.readingCount > 0 ? (
            <>
              <p className="font-serif text-2xl text-primary">
                {formatTemp(report.tempMean)}
              </p>
              <p className="text-xs text-muted mt-1">
                {formatTemp(report.tempMin)} – {formatTemp(report.tempMax)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted italic">No readings</p>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Droplets className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Humidity
            </p>
          </div>
          {report.readingCount > 0 ? (
            <>
              <p className="font-serif text-2xl text-primary">
                {formatHumidity(report.humidityMean)}
              </p>
              <p className="text-xs text-muted mt-1">
                {formatHumidity(report.humidityMin)} –{" "}
                {formatHumidity(report.humidityMax)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted italic">No readings</p>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gold" />
            <p className="text-[10px] uppercase tracking-wider text-muted">
              Monitoring
            </p>
          </div>
          <p className="font-serif text-2xl text-primary">
            {report.readingCount}
          </p>
          <p className="text-xs text-muted mt-1">
            sensor reading{report.readingCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-muted text-center">
        Report generated {formatDate(new Date())} from Sentinel data for{" "}
        {event.facility.name}. Signed by the facility operator of record.
      </p>
    </div>
  );
}
