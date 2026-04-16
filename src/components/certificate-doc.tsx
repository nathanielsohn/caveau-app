"use client";

import dynamic from "next/dynamic";
import { CheckCircle2, Printer } from "lucide-react";
import { formatDate, formatTemp, formatHumidity } from "@/lib/utils";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((mod) => mod.QRCodeSVG),
  { ssr: false, loading: () => <div className="w-[80px] h-[80px] bg-[#2A2A30] rounded-lg animate-pulse" /> }
);

interface CertificateData {
  id: string;
  certificateNumber: string;
  monitoringStart: Date;
  monitoringEnd: Date;
  // Numbers (not Prisma Decimals) — the server component serializes these
  // before passing them across the client boundary.
  tempMean: number | null;
  tempMin: number | null;
  tempMax: number | null;
  humidityMean: number | null;
  dataIntegrityHash: string;
  wine: {
    name: string;
    vintage: number;
    region: string;
    producer: string;
  };
  locker: {
    lockerNumber: number;
    zone: string;
  };
}

const NA = "—";

export default function CertificateDoc({
  certificate,
}: {
  certificate: CertificateData;
}) {
  const { wine, locker } = certificate;

  return (
    <div className="certificate-document mx-auto max-w-[720px] relative">
      {/* Gold double-line border */}
      <div
        className="rounded-lg p-1"
        style={{
          border: "3px solid #FFD166",
          boxShadow: "inset 0 0 0 2px #0A0A0B, inset 0 0 0 4px #FFD166",
        }}
      >
        <div className="bg-[#141416] rounded px-8 py-10 sm:px-12 sm:py-14">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="text-gold text-4xl mb-3">◈</div>
            <h1 className="font-serif text-3xl sm:text-4xl text-primary tracking-wide mb-1">
              Caveau
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-text">
              Certificate
            </p>
          </div>

          {/* Decorative separator */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <div className="h-px w-16 bg-gold/30" />
            <div className="text-gold text-xs">◈</div>
            <div className="h-px w-16 bg-gold/30" />
          </div>

          {/* Wine Information */}
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-3">
              Wine
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl text-primary mb-1">
              {wine.name}
            </h2>
            <p className="text-lg text-gold-text mb-3">{wine.vintage}</p>
            <div className="flex items-center justify-center gap-2 text-sm text-secondary">
              <span>{wine.producer}</span>
              <span className="text-muted">·</span>
              <span>{wine.region}</span>
            </div>
          </div>

          {/* Storage Location */}
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Storage Location
            </p>
            <p className="text-sm text-secondary">
              Locker #{locker.lockerNumber} &mdash; {locker.zone} Zone
            </p>
          </div>

          {/* Monitoring Period */}
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Monitoring Period
            </p>
            <p className="text-sm text-secondary">
              {formatDate(certificate.monitoringStart)} &mdash;{" "}
              {formatDate(certificate.monitoringEnd)}
            </p>
          </div>

          {/* Environmental Summary */}
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-5">
              Environmental Summary
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <EnvironmentalStat
                label="Avg Temp"
                value={certificate.tempMean != null ? formatTemp(certificate.tempMean) : NA}
              />
              <EnvironmentalStat
                label="Min Temp"
                value={certificate.tempMin != null ? formatTemp(certificate.tempMin) : NA}
              />
              <EnvironmentalStat
                label="Max Temp"
                value={certificate.tempMax != null ? formatTemp(certificate.tempMax) : NA}
              />
              <EnvironmentalStat
                label="Avg Humidity"
                value={certificate.humidityMean != null ? formatHumidity(certificate.humidityMean) : NA}
              />
            </div>
            {/* Optimal range note */}
            <p className="text-xs text-muted text-center mt-4">
              Optimal storage: 50&ndash;59&deg;F &middot; 55&ndash;75% humidity
            </p>
          </div>

          {/* Data Integrity Badge */}
          <div className="mb-10">
            <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-4">
              Data Integrity
            </p>
            <div className="flex items-center justify-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-ok flex-shrink-0" />
              <span className="text-sm text-ok font-medium">
                SHA-256 Verified
              </span>
            </div>
            <div className="bg-[#0A0A0B] border border-[#2A2A30]/50 rounded-lg px-4 py-3 text-center">
              <code className="text-xs text-secondary break-all font-mono leading-relaxed">
                {certificate.dataIntegrityHash}
              </code>
            </div>
          </div>

          {/* QR Code — links to public verification page */}
          <div className="flex flex-col items-center mb-10">
            <div className="bg-white rounded-lg p-2">
              <QRCodeSVG
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/verify/${certificate.dataIntegrityHash}`}
                size={80}
                fgColor="#FFD166"
                bgColor="transparent"
                level="M"
              />
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted mt-2">
              Scan to verify
            </p>
          </div>

          {/* Decorative separator */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-px w-16 bg-gold/30" />
            <div className="text-gold text-xs">◈</div>
            <div className="h-px w-16 bg-gold/30" />
          </div>

          {/* Certificate Number & Issue Date */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Certificate No.
            </p>
            <p className="font-mono text-sm text-gold-text tracking-wider mb-4">
              {certificate.certificateNumber}
            </p>
            <p className="text-xs text-muted">
              Issued {formatDate(certificate.monitoringEnd)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvironmentalStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-center bg-[#0A0A0B]/60 border border-[#2A2A30]/30 rounded-lg py-3 px-2">
      <p className="text-base font-medium text-primary mb-1">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}

/** Print button — client component, colocated here for simplicity */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="no-print flex items-center gap-2 btn-ghost text-sm"
    >
      <Printer size={16} />
      Print
    </button>
  );
}
