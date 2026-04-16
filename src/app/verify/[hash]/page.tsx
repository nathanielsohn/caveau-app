import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTemp, formatHumidity } from "@/lib/utils";

export const dynamic = "force-dynamic";

// A certificate hash is a 64-char lowercase hex string (SHA-256). Anything
// outside that shape can't possibly match a real row, so short-circuit
// before the DB hit to starve scanners that brute-force the endpoint.
const HASH_SHAPE = /^[a-f0-9]{64}$/;

// Belt-and-braces with the Referrer-Policy response header set for this
// route in src/middleware.ts. The <meta> tag below covers renderers
// that honor it; the HTTP header covers everything else.
export const metadata = {
  referrer: "no-referrer",
} as const;

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  const certificate = HASH_SHAPE.test(hash)
    ? await prisma.provenanceCertificate.findFirst({
        where: { dataIntegrityHash: hash, revokedAt: null },
        include: {
          wine: {
            select: {
              name: true,
              vintage: true,
              producer: true,
            },
          },
          locker: {
            select: {
              lockerNumber: true,
              zone: true,
            },
          },
        },
      })
    : null;

  const truncatedHash = hash.length > 16 ? `${hash.slice(0, 16)}...` : hash;

  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      {/* Caveau Logo */}
      <div className="text-gold text-5xl mb-8">◈</div>

      {certificate ? (
        <div className="w-full max-w-md">
          {/* Verified Badge */}
          <div className="flex flex-col items-center mb-8">
            <CheckCircle2 size={48} className="text-ok mb-3" />
            <h1 className="font-serif text-2xl sm:text-3xl text-primary">
              Certificate Verified
            </h1>
            <p className="text-sm text-secondary mt-1">
              This Caveau Certificate is authentic.
            </p>
          </div>

          {/* Certificate Details Card */}
          <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 sm:p-8 space-y-6">
            {/* Wine Info */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Wine
              </p>
              <h2 className="font-serif text-xl text-primary mb-1">
                {certificate.wine.name}
              </h2>
              <p className="text-sm text-gold-text mb-1">
                {certificate.wine.vintage}
              </p>
              <p className="text-sm text-secondary">
                {certificate.wine.producer}
              </p>
            </div>

            {/* Divider */}
            <div className="h-px bg-[#2A2A30]/50" />

            {/* Monitoring Period */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Monitoring Period
              </p>
              <p className="text-sm text-secondary">
                {formatDate(certificate.monitoringStart)} &mdash;{" "}
                {formatDate(certificate.monitoringEnd)}
              </p>
            </div>

            {/* Environmental Summary */}
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-4">
                Environmental Summary
              </p>
              <div className="grid grid-cols-2 gap-3">
                <EnvStat
                  label="Avg Temp"
                  value={certificate.tempMean != null ? formatTemp(certificate.tempMean) : "—"}
                />
                <EnvStat
                  label="Min Temp"
                  value={certificate.tempMin != null ? formatTemp(certificate.tempMin) : "—"}
                />
                <EnvStat
                  label="Max Temp"
                  value={certificate.tempMax != null ? formatTemp(certificate.tempMax) : "—"}
                />
                <EnvStat
                  label="Avg Humidity"
                  value={certificate.humidityMean != null ? formatHumidity(certificate.humidityMean) : "—"}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[#2A2A30]/50" />

            {/* Certificate Number */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Certificate No.
              </p>
              <p className="font-mono text-sm text-gold-text tracking-wider">
                {certificate.certificateNumber}
              </p>
            </div>

            {/* Data Integrity Hash */}
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Data Integrity Hash
              </p>
              <p className="font-mono text-xs text-secondary">
                {truncatedHash}
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted mt-6">
            Verified by Caveau
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md">
          {/* Not Found */}
          <div className="flex flex-col items-center mb-8">
            <XCircle size={48} className="text-danger mb-3" />
            <h1 className="font-serif text-2xl sm:text-3xl text-primary">
              Certificate Not Found
            </h1>
            <p className="text-sm text-secondary mt-1">
              No certificate matches the provided hash.
            </p>
          </div>

          <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Hash Searched
            </p>
            <p className="font-mono text-xs text-secondary break-all">
              {truncatedHash}
            </p>
          </div>

          <p className="text-center text-xs text-muted mt-6">
            If you believe this is an error, contact Caveau support.
          </p>
        </div>
      )}
    </div>
  );
}

function EnvStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-[#0A0A0B]/60 border border-[#2A2A30]/30 rounded-lg py-3 px-2">
      <p className="text-base font-medium text-primary mb-1">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
