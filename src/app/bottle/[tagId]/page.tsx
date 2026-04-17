import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import {
  Activity,
  BadgeCheck,
  Droplets,
  ShieldCheck,
  Thermometer,
  XCircle,
} from "lucide-react";
import {
  loadBottleByTag,
  recordNfcScan,
  TAG_ID_PATTERN,
  type BottleBundle,
} from "@/lib/nfc";
import { clientIp } from "@/lib/rate-limit";
import {
  formatCurrency,
  formatDate,
  formatHumidity,
  formatTemp,
} from "@/lib/utils";

// The page does a DB write (scan log) per view. No caching.
export const dynamic = "force-dynamic";

export default async function BottleLandingPage({
  params,
}: {
  params: Promise<{ tagId: string }>;
}) {
  const { tagId } = await params;

  // Reject structurally invalid tags before the DB lookup so scanners
  // can't bruteforce hash-shaped strings against the unique index.
  // Same shape-guard pattern as /handoff/[token].
  if (!TAG_ID_PATTERN.test(tagId)) {
    notFound();
  }

  const bundle = await loadBottleByTag(tagId);
  if (!bundle) {
    return <NotFoundView />;
  }

  // Only log successful lookups so a 404 isn't mistaken for a valid tap
  // in the owner's dashboard.
  const h = headers();
  await recordNfcScan(
    bundle.tag.id,
    clientIp(h),
    h.get("user-agent"),
  );

  return <BottleView bundle={bundle} />;
}

function BottleView({ bundle }: { bundle: BottleBundle }) {
  const { wine, owner, livex, certificate, custody, tag, disposed } = bundle;

  return (
    <div className="min-h-screen bg-caveau-black">
      {/* Header band */}
      <header className="border-b border-[#2A2A30]/50 bg-caveau-charcoal/60">
        <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-gold text-2xl" aria-hidden>◈</span>
            <div>
              <p className="font-serif text-lg text-primary leading-tight">
                Caveau
              </p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted">
                Tap-to-Verify
              </p>
            </div>
          </div>
          <TierBadge tier={tag.tier} />
        </div>
      </header>

      <main className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Hero */}
        <section className="glass-card p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[180px_1fr] items-start">
            <div className="w-full max-w-[180px] mx-auto sm:mx-0 aspect-[3/4] rounded-xl overflow-hidden bg-[#0C0C0E] border border-[#2A2A30]/60 relative">
              {wine.photoUrl ? (
                <Image
                  src={wine.photoUrl}
                  alt={`${wine.producer} ${wine.name} ${wine.vintage}`}
                  fill
                  sizes="(min-width: 640px) 180px, 80vw"
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
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.25em] text-gold-text">
                {wine.vintage} Vintage
              </p>
              <h1 className="font-serif text-2xl sm:text-3xl text-primary leading-tight">
                {wine.name}
              </h1>
              <p className="text-sm text-secondary">
                {wine.producer}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                <Chip>{wine.varietal}</Chip>
                <Chip>{wine.region}</Chip>
              </div>
              <p className="text-xs text-muted pt-1">
                Under Caveau custody for {owner.name}.
              </p>
              {disposed && (
                <div className="text-xs bg-muted/10 text-muted border border-muted/20 rounded-lg px-3 py-2 mt-2">
                  This bottle has left active custody. The record below
                  reflects its Caveau history up to disposition.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Integrity badge */}
        <section className="glass-card p-5 flex items-start gap-3">
          <ShieldCheck size={28} className="text-ok flex-shrink-0" aria-hidden />
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">
              Verified Caveau bottle
            </p>
            <p className="text-xs text-secondary mt-1">
              This tag has been verified {tag.scanCount.toLocaleString()}{" "}
              time{tag.scanCount === 1 ? "" : "s"}
              {tag.activatedAt
                ? ` since ${formatDate(tag.activatedAt)}`
                : ""}
              . Each tap is logged as part of the chain of custody.
            </p>
          </div>
        </section>

        {/* Current Liv-ex valuation */}
        <section className="glass-card p-5">
          <p className="text-[11px] uppercase tracking-wider text-muted mb-2">
            Current valuation
          </p>
          {livex ? (
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <p className="font-serif text-2xl text-gold">
                {formatCurrency(livex.price)}
              </p>
              <p className="text-xs text-muted">
                Liv-ex Mid-Price · {formatDate(livex.date)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-secondary">
              No live Liv-ex quote on file. A valuation will appear here after
              the next daily sync.
            </p>
          )}
        </section>

        {/* Sentinel chain-of-custody summary */}
        {certificate && custody ? (
          <section className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[11px] uppercase tracking-wider text-muted">
                Sentinel chain of custody
              </p>
              <p className="text-[11px] text-muted">
                {formatDate(certificate.monitoringStart)} –{" "}
                {formatDate(certificate.monitoringEnd)}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <EnvStat
                icon={<Thermometer size={14} />}
                label="Avg temp"
                value={
                  custody.tempMean != null ? formatTemp(custody.tempMean) : "—"
                }
              />
              <EnvStat
                icon={<Thermometer size={14} />}
                label="Range"
                value={
                  custody.tempMin != null && custody.tempMax != null
                    ? `${formatTemp(custody.tempMin)} – ${formatTemp(custody.tempMax)}`
                    : "—"
                }
              />
              <EnvStat
                icon={<Droplets size={14} />}
                label="Humidity"
                value={
                  custody.humidityMean != null
                    ? formatHumidity(custody.humidityMean)
                    : "—"
                }
              />
              <EnvStat
                icon={<Activity size={14} />}
                label="Readings"
                value={custody.sampleCount.toLocaleString()}
              />
            </div>
            <p className="text-xs text-secondary">
              {custody.sampleCount.toLocaleString()} sensor readings recorded
              while this bottle sat under Caveau custody. Report{" "}
              <span className="font-mono text-gold-text">
                {certificate.certificateNumber}
              </span>{" "}
              is the auditable record.
            </p>
          </section>
        ) : (
          <section className="glass-card p-5 text-center">
            <p className="text-sm text-secondary">
              No Caveau Custody & Condition Report has been issued for this bottle yet.
            </p>
            <p className="text-xs text-muted mt-1">
              Reports are issued after the first monitoring window closes.
            </p>
          </section>
        )}

        {/* CTA → Caveau Custody & Condition Report */}
        {certificate ? (
          <Link
            href={`/report/${certificate.id}`}
            className="block glass-card p-5 hover:border-gold/40 transition-colors group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center flex-shrink-0">
                  <BadgeCheck className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <p className="font-serif text-base text-primary group-hover:text-gold transition-colors">
                    View full Custody & Condition Report
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    Environmental envelope, chain of custody, integrity hash.
                  </p>
                </div>
              </div>
              <span className="text-gold text-sm">→</span>
            </div>
          </Link>
        ) : null}

        <footer className="text-center text-xs text-muted py-6 space-y-1">
          <p>Caveau · Naples, FL</p>
          <p className="text-muted/70">
            Tap the chip again any time to refresh this record.
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small render helpers                                               */
/* ------------------------------------------------------------------ */

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-burgundy/10 text-burgundy border border-burgundy/20">
      {children}
    </span>
  );
}

function EnvStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-[#0A0A0B]/60 border border-[#2A2A30]/40 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm text-primary font-medium tabular-nums">{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: "capsule" | "collar" }) {
  if (tier === "capsule") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border bg-gold/10 text-gold border-gold/20">
        Capsule
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium border bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20">
      Collar
    </span>
  );
}

function NotFoundView() {
  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>
      <div className="w-full max-w-md text-center">
        <XCircle size={48} className="text-danger mx-auto mb-3" />
        <h1 className="font-serif text-2xl sm:text-3xl text-primary">
          Tag Not Recognized
        </h1>
        <p className="text-sm text-secondary mt-2">
          This tag isn&apos;t registered with Caveau, or the bottle it was
          paired with has been removed from the custody ledger.
        </p>
        <p className="text-xs text-muted mt-4">
          Caveau · Naples, FL
        </p>
      </div>
    </div>
  );
}
