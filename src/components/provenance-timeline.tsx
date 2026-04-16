import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  FileSignature,
  PackageOpen,
  Thermometer,
} from "lucide-react";
import type {
  ProvenanceBundle,
  ProvenanceEvent,
  ProvenanceEventKind,
} from "@/lib/provenance";
import { formatDate, formatHumidity, formatTemp } from "@/lib/utils";

/**
 * Vertical chain-of-custody timeline (feature #40). Server component — pure
 * rendering over a `ProvenanceBundle` produced by `buildProvenanceBundle`.
 */
export default function ProvenanceTimeline({
  bundle,
}: {
  bundle: ProvenanceBundle;
}) {
  const { envelope, events } = bundle;

  return (
    <section
      aria-labelledby="provenance-heading"
      className="mx-auto max-w-[720px] mt-10 px-4 sm:px-0"
    >
      <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 sm:p-8">
        <header className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-text mb-2">
            Chain of Custody
          </p>
          <h2
            id="provenance-heading"
            className="font-serif text-2xl text-primary"
          >
            Timeline
          </h2>
          <p className="text-xs text-muted mt-2">
            {formatDate(envelope.start)} &mdash; {formatDate(envelope.end)}
            {" · "}
            {envelope.sampleCount.toLocaleString()} sensor readings
          </p>
        </header>

        {/* Envelope */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          <EnvelopeStat
            icon={<Thermometer size={14} />}
            label="Temperature"
            range={
              envelope.temp
                ? `${formatTemp(envelope.temp.min)} – ${formatTemp(envelope.temp.max)}`
                : "—"
            }
            avg={envelope.temp ? `avg ${formatTemp(envelope.temp.avg)}` : ""}
          />
          <EnvelopeStat
            icon={<Activity size={14} />}
            label="Humidity"
            range={
              envelope.humidity
                ? `${formatHumidity(envelope.humidity.min)} – ${formatHumidity(envelope.humidity.max)}`
                : "—"
            }
            avg={
              envelope.humidity
                ? `avg ${formatHumidity(envelope.humidity.avg)}`
                : ""
            }
          />
          <EnvelopeStat
            icon={<CheckCircle2 size={14} />}
            label="Events logged"
            range={String(events.length)}
            avg={`${events.filter((e) => e.kind === "alert").length} alerts`}
          />
        </div>

        {/* Timeline */}
        {events.length === 0 ? (
          <p className="text-center text-sm text-muted py-6">
            No timeline events recorded.
          </p>
        ) : (
          <ol className="relative pl-6 sm:pl-8">
            <span
              aria-hidden
              className="absolute left-[7px] sm:left-[11px] top-1 bottom-1 w-px bg-gold/20"
            />
            {events.map((event, idx) => (
              <TimelineRow
                key={`${event.kind}-${event.date}-${idx}`}
                event={event}
              />
            ))}
          </ol>
        )}

        {/* Signature footer */}
        <div className="mt-8 pt-6 border-t border-[#2A2A30]/50">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted text-center mb-2">
            Bundle Signature
          </p>
          <code className="block text-[10px] text-secondary text-center font-mono break-all">
            {bundle.signature}
          </code>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
            <a
              href={`/api/certificates/${bundle.certificateId}/provenance?format=pdf`}
              className="btn-primary text-sm inline-flex items-center gap-2"
            >
              <ArrowDownToLine size={14} />
              Download PDF
            </a>
            <a
              href={`/api/certificates/${bundle.certificateId}/provenance?format=json`}
              className="btn-ghost text-sm inline-flex items-center gap-2"
            >
              <ArrowDownToLine size={14} />
              Signed JSON
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function EnvelopeStat({
  icon,
  label,
  range,
  avg,
}: {
  icon: React.ReactNode;
  label: string;
  range: string;
  avg: string;
}) {
  return (
    <div className="bg-[#0A0A0B]/60 border border-[#2A2A30]/40 rounded-lg px-3 py-3">
      <div className="flex items-center gap-1.5 text-muted mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm text-primary font-medium">{range}</p>
      {avg ? <p className="text-[10px] text-muted mt-0.5">{avg}</p> : null}
    </div>
  );
}

function TimelineRow({ event }: { event: ProvenanceEvent }) {
  const { color, Icon } = ICONS[event.kind];
  const isCritical = event.severity === "critical";
  const isWarning = event.severity === "warning";
  const dotColor = isCritical
    ? "bg-danger border-danger"
    : isWarning
      ? "bg-gold border-gold"
      : color;

  return (
    <li className="relative pb-6 last:pb-0">
      <span
        aria-hidden
        className={`absolute -left-6 sm:-left-8 top-0 flex items-center justify-center w-4 h-4 rounded-full border ${dotColor}`}
      >
        <Icon size={9} className="text-caveau-black" />
      </span>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <p className="text-[11px] uppercase tracking-wider text-muted whitespace-nowrap">
          {formatDate(event.date)}
        </p>
        <p className="text-sm text-primary font-medium">{event.title}</p>
      </div>
      {event.detail ? (
        <p
          className={`text-xs mt-1 ${
            isCritical
              ? "text-danger"
              : isWarning
                ? "text-gold-text"
                : "text-secondary"
          }`}
        >
          {event.detail}
        </p>
      ) : null}
    </li>
  );
}

const ICONS: Record<
  ProvenanceEventKind,
  { color: string; Icon: typeof Activity }
> = {
  intake: { color: "bg-gold border-gold", Icon: PackageOpen },
  placement: { color: "bg-gold/70 border-gold/70", Icon: ArrowDownToLine },
  alert: { color: "bg-gold border-gold", Icon: AlertTriangle },
  certificate: { color: "bg-gold border-gold", Icon: FileSignature },
  disposition: { color: "bg-burgundy border-burgundy", Icon: PackageOpen },
  current: { color: "bg-ok border-ok", Icon: CheckCircle2 },
};
