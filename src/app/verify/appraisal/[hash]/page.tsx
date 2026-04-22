import { CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { AppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BASIS_LABELS, PURPOSE_LABELS } from "@/lib/appraisals";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Same 64-char SHA-256 shape guard as /verify/[hash] — short-circuit the
// DB hit for anything that can't possibly match a real row.
const HASH_SHAPE = /^[a-f0-9]{64}$/;

export const metadata = {
  referrer: "no-referrer",
} as const;

export default async function VerifyAppraisalPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;

  const appraisal = HASH_SHAPE.test(hash)
    ? await prisma.appraisal.findFirst({
        where: {
          dataIntegrityHash: hash,
          status: AppraisalStatus.completed,
          revokedAt: null,
        },
        select: {
          appraisalNumber: true,
          purpose: true,
          basis: true,
          effectiveDate: true,
          bottleCount: true,
          totalBasisUsd: true,
          appraiserName: true,
          isWelcomeAppraisal: true,
          dataIntegrityHash: true,
          member: { select: { name: true } },
        },
      })
    : null;

  const truncatedHash = hash.length > 16 ? `${hash.slice(0, 16)}...` : hash;

  return (
    <div className="min-h-screen bg-caveau-black flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>

      {appraisal ? (
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <CheckCircle2 size={48} className="text-ok mb-3" />
            <h1 className="font-serif text-2xl sm:text-3xl text-primary">
              Appraisal Verified
            </h1>
            <p className="text-sm text-secondary mt-1">
              This Caveau appraisal is authentic and current.
            </p>
            {appraisal.isWelcomeAppraisal && (
              <p className="inline-flex items-center gap-1 mt-2 text-[10px] uppercase tracking-[0.2em] text-gold-text">
                <Sparkles className="w-3 h-3" />
                Founding Circle
              </p>
            )}
          </div>

          <div className="bg-[#141416]/80 backdrop-blur-xl border border-[#2A2A30]/50 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Appraised for
              </p>
              <h2 className="font-serif text-xl text-primary">
                {appraisal.member.name}
              </h2>
            </div>

            <div className="h-px bg-[#2A2A30]/50" />

            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Purpose"
                value={PURPOSE_LABELS[appraisal.purpose]}
              />
              <Stat label="Basis" value={BASIS_LABELS[appraisal.basis]} />
              <Stat
                label="Bottles"
                value={(appraisal.bottleCount ?? 0).toLocaleString()}
              />
              <Stat
                label="Total basis"
                value={formatCurrency(toNumber(appraisal.totalBasisUsd ?? 0))}
              />
            </div>

            <div className="h-px bg-[#2A2A30]/50" />

            {appraisal.effectiveDate && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                  Effective date
                </p>
                <p className="text-sm text-secondary">
                  {formatDate(appraisal.effectiveDate)}
                </p>
              </div>
            )}

            <div className="h-px bg-[#2A2A30]/50" />

            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Appraisal No.
              </p>
              <p className="font-mono text-sm text-gold-text tracking-wider">
                {appraisal.appraisalNumber}
              </p>
            </div>

            {appraisal.appraiserName && (
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                  Appraised by
                </p>
                <p className="text-sm text-secondary">
                  {appraisal.appraiserName}
                </p>
              </div>
            )}

            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
                Data Integrity Hash
              </p>
              <p className="font-mono text-xs text-secondary">
                {truncatedHash}
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted mt-6">
            Verified by Caveau
          </p>
        </div>
      ) : (
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <XCircle size={48} className="text-danger mb-3" />
            <h1 className="font-serif text-2xl sm:text-3xl text-primary">
              Appraisal Not Found
            </h1>
            <p className="text-sm text-secondary mt-1">
              No appraisal matches the provided hash. The document may have
              been revoked or the hash is malformed.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center bg-[#0A0A0B]/60 border border-[#2A2A30]/30 rounded-lg py-3 px-2">
      <p className="text-sm font-medium text-primary mb-1">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
