import { notFound } from "next/navigation";
import Image from "next/image";
import { headers } from "next/headers";
import {
  Activity,
  CheckCircle2,
  ShieldCheck,
  Thermometer,
  XCircle,
} from "lucide-react";
import {
  loadHandoffBundle,
  recordHandoffAccess,
  type HandoffBundle,
} from "@/lib/handoff";
import { clientIp } from "@/lib/rate-limit";
import ProvenanceTimeline from "@/components/provenance-timeline";
import {
  formatCurrency,
  formatDate,
  formatHumidity,
  formatTemp,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  auction: "Auction House",
  broker: "Broker",
  private: "Private Sale",
};

export default async function HandoffPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Quick sanity: tokens are generated as base64url of 24 bytes. Reject
  // anything structurally wrong before touching the DB so scanners can't
  // bruteforce hash-shaped strings against the index.
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    notFound();
  }

  const bundle = await loadHandoffBundle(token);

  if (!bundle) {
    return <NotFoundView />;
  }

  // Only log successful lookups so a 404 isn't mistaken for a valid access
  // in the owner's dashboard.
  const h = headers();
  await recordHandoffAccess(
    bundle.package.id,
    clientIp(h),
    h.get("user-agent"),
  );

  if (bundle.expired) {
    return <ExpiredView bundle={bundle} />;
  }

  return <BundleView bundle={bundle} />;
}

function BundleView({ bundle }: { bundle: HandoffBundle }) {
  const { package: pkg, wine, owner, livex, provenance } = bundle;
  const channelLabel = CHANNEL_LABELS[pkg.channel] ?? pkg.channel;

  return (
    <div className="min-h-screen bg-caveau-black">
      {/* Header band */}
      <header className="border-b border-[#2A2A30]/50 bg-caveau-charcoal/60">
        <div className="max-w-[880px] mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-gold text-2xl" aria-hidden>◈</span>
            <div>
              <p className="font-serif text-lg text-primary leading-tight">
                Caveau
              </p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                Handoff Package
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-muted">
              Channel
            </p>
            <p className="text-sm text-gold-text font-medium">
              {channelLabel}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[880px] mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Intro */}
        <section className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gold-text mb-2">
            Prepared for {pkg.recipientName}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-primary mb-2">
            {wine.name}
          </h1>
          <p className="text-sm text-secondary">
            {wine.vintage} &middot; {wine.producer} &middot; {wine.region}
          </p>
          <p className="text-xs text-muted mt-3">
            Presented by {owner.name} via Caveau custody.
          </p>
        </section>

        {/* Summary card: photo + headline facts */}
        <section className="glass-card p-6 grid gap-6 sm:grid-cols-[220px_1fr] items-center">
          <div className="w-full aspect-[3/4] rounded-xl overflow-hidden bg-[#0C0C0E] border border-[#2A2A30]/60 relative max-w-[220px] mx-auto sm:mx-0">
            {wine.photoUrl ? (
              <Image
                src={wine.photoUrl}
                alt={`${wine.producer} ${wine.name} ${wine.vintage}`}
                fill
                sizes="220px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-[10px] tracking-[0.2em] uppercase text-muted"
                  aria-hidden
                >
                  No photo
                </span>
              </div>
            )}
          </div>
          <dl className="space-y-4">
            <Fact
              label="Varietal"
              value={wine.varietal}
            />
            <Fact
              label="Current Liv-ex valuation"
              value={
                livex ? (
                  <>
                    <span className="text-primary font-medium">
                      {formatCurrency(livex.price)}
                    </span>
                    <span className="text-muted text-xs ml-2">
                      as of {formatDate(livex.date)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Not yet synced</span>
                )
              }
            />
            <Fact
              label="Caveau Certificate"
              value={
                provenance ? (
                  <span className="font-mono text-sm text-gold-text">
                    {provenance.certificateNumber}
                  </span>
                ) : (
                  <span className="text-muted">Pending issuance</span>
                )
              }
            />
            <Fact
              label="Package issued"
              value={formatDate(pkg.createdAt)}
            />
            {pkg.expiresAt ? (
              <Fact
                label="Link expires"
                value={formatDate(pkg.expiresAt)}
              />
            ) : null}
          </dl>
        </section>

        {/* Integrity badge */}
        {provenance ? (
          <section className="glass-card p-6 flex items-start gap-4">
            <ShieldCheck
              size={32}
              className="text-ok flex-shrink-0"
              aria-hidden
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">
                Unbroken custody verified
              </p>
              <p className="text-xs text-secondary mt-1">
                {provenance.envelope.sampleCount.toLocaleString()} sensor
                readings from {formatDate(provenance.envelope.start)} to{" "}
                {formatDate(provenance.envelope.end)}. Independently verifiable
                via the hash below.
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-muted">
                Bundle signature
              </p>
              <code className="block mt-1 text-[10px] text-secondary font-mono break-all">
                {provenance.signature}
              </code>
            </div>
          </section>
        ) : null}

        {/* Sentinel envelope reuses the #40 helper data shape */}
        {provenance ? (
          <section aria-labelledby="envelope-heading" className="glass-card p-6">
            <header className="text-center mb-5">
              <p className="text-xs uppercase tracking-[0.3em] text-gold-text mb-1">
                Sentinel Envelope
              </p>
              <h2
                id="envelope-heading"
                className="font-serif text-xl text-primary"
              >
                Storage Conditions
              </h2>
            </header>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <EnvelopeCard
                icon={<Thermometer size={14} />}
                label="Temperature"
                range={
                  provenance.envelope.temp
                    ? `${formatTemp(provenance.envelope.temp.min)} – ${formatTemp(provenance.envelope.temp.max)}`
                    : "—"
                }
                avg={
                  provenance.envelope.temp
                    ? `avg ${formatTemp(provenance.envelope.temp.avg)}`
                    : ""
                }
              />
              <EnvelopeCard
                icon={<Activity size={14} />}
                label="Humidity"
                range={
                  provenance.envelope.humidity
                    ? `${formatHumidity(provenance.envelope.humidity.min)} – ${formatHumidity(provenance.envelope.humidity.max)}`
                    : "—"
                }
                avg={
                  provenance.envelope.humidity
                    ? `avg ${formatHumidity(provenance.envelope.humidity.avg)}`
                    : ""
                }
              />
              <EnvelopeCard
                icon={<CheckCircle2 size={14} />}
                label="Events logged"
                range={String(provenance.events.length)}
                avg={`${provenance.events.filter((e) => e.kind === "alert").length} alerts`}
              />
            </div>
          </section>
        ) : null}

        {/* Full provenance timeline — reused component from feature #40 */}
        {provenance ? (
          <ProvenanceTimeline bundle={provenance} />
        ) : (
          <section className="glass-card p-6 text-center">
            <p className="text-sm text-secondary">
              No Caveau Certificate has been issued yet for this bottle.
            </p>
          </section>
        )}

        <footer className="text-center text-xs text-muted pb-6">
          <p>This link is private. Please do not forward.</p>
          <p className="mt-1">
            Caveau · Naples, FL
          </p>
        </footer>
      </main>
    </div>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-primary">{value}</dd>
    </div>
  );
}

function EnvelopeCard({
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

function NotFoundView() {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>
      <div className="w-full max-w-md text-center">
        <XCircle size={48} className="text-danger mx-auto mb-3" />
        <h1 className="font-serif text-2xl sm:text-3xl text-primary">
          Package Not Found
        </h1>
        <p className="text-sm text-secondary mt-2">
          This handoff link is invalid or has been revoked.
        </p>
      </div>
    </div>
  );
}

function ExpiredView({ bundle }: { bundle: HandoffBundle }) {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>
      <div className="w-full max-w-md text-center">
        <XCircle size={48} className="text-danger mx-auto mb-3" />
        <h1 className="font-serif text-2xl sm:text-3xl text-primary">
          Link Expired
        </h1>
        <p className="text-sm text-secondary mt-2">
          This handoff link expired on{" "}
          {bundle.package.expiresAt
            ? formatDate(bundle.package.expiresAt)
            : "—"}
          . Contact {bundle.owner.name} for a fresh link.
        </p>
      </div>
    </div>
  );
}

