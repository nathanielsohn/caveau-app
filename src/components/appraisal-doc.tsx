"use client";

import dynamic from "next/dynamic";
import { CheckCircle2, Sparkles } from "lucide-react";
import { AppraisalBasis, AppraisalPurpose } from "@prisma/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  BASIS_LABELS,
  PURPOSE_LABELS,
  type AppraisalHeir,
  type AppraisalLineItem,
} from "@/lib/appraisals";

const QRCodeSVG = dynamic(
  () => import("qrcode.react").then((mod) => mod.QRCodeSVG),
  {
    ssr: false,
    loading: () => (
      <div className="w-[80px] h-[80px] bg-[#2A2A30] rounded-lg animate-pulse" />
    ),
  },
);

interface AppraisalDocData {
  appraisalNumber: string;
  memberName: string;
  purpose: AppraisalPurpose;
  basis: AppraisalBasis;
  effectiveDate: Date;
  appraiserName: string;
  appraiserCreds: string | null;
  scopeOfWork: string | null;
  bottleCount: number;
  totalBasisUsd: number;
  lineItems: AppraisalLineItem[];
  heirs: AppraisalHeir[];
  dataIntegrityHash: string;
  isWelcomeAppraisal: boolean;
}

export default function AppraisalDoc({
  appraisal,
}: {
  appraisal: AppraisalDocData;
}) {
  const verifyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify/appraisal/${appraisal.dataIntegrityHash}`
      : `/verify/appraisal/${appraisal.dataIntegrityHash}`;

  return (
    <div className="certificate-document mx-auto max-w-[720px]">
      <div
        className="rounded-lg p-1"
        style={{
          border: "3px solid #FFD166",
          boxShadow: "inset 0 0 0 2px #0A0A0B, inset 0 0 0 4px #FFD166",
        }}
      >
        <div className="bg-[#141416] rounded px-8 py-10 sm:px-12 sm:py-14">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-gold text-4xl mb-3">◈</div>
            <h1 className="font-serif text-3xl sm:text-4xl text-primary tracking-wide mb-1">
              Caveau
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-gold-text">
              Appraisal
            </p>
            {appraisal.isWelcomeAppraisal && (
              <p className="inline-flex items-center gap-1 mt-2 text-[10px] uppercase tracking-[0.2em] text-gold">
                <Sparkles className="w-3 h-3" />
                Founding Circle
              </p>
            )}
          </div>

          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-px w-16 bg-gold/30" />
            <div className="text-gold text-xs">◈</div>
            <div className="h-px w-16 bg-gold/30" />
          </div>

          {/* Appraised for */}
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Appraised for
            </p>
            <h2 className="font-serif text-2xl text-primary">
              {appraisal.memberName}
            </h2>
          </div>

          {/* Purpose & basis */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-1">
                Purpose
              </p>
              <p className="text-sm text-primary font-medium">
                {PURPOSE_LABELS[appraisal.purpose]}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.2em] text-muted mb-1">
                Basis
              </p>
              <p className="text-sm text-primary font-medium">
                {BASIS_LABELS[appraisal.basis]}
              </p>
            </div>
          </div>

          {/* Effective date */}
          <div className="text-center mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Effective date
            </p>
            <p className="text-sm text-secondary">
              {formatDate(appraisal.effectiveDate)}
            </p>
          </div>

          {/* Appraiser */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-2">
              Appraiser
            </p>
            <p className="text-center text-sm text-primary font-medium">
              {appraisal.appraiserName}
            </p>
            {appraisal.appraiserCreds && (
              <p className="text-center text-xs text-muted mt-1">
                {appraisal.appraiserCreds}
              </p>
            )}
            {appraisal.scopeOfWork && (
              <p className="text-center text-xs text-secondary mt-3 italic leading-relaxed max-w-lg mx-auto">
                {appraisal.scopeOfWork}
              </p>
            )}
          </div>

          {/* Valuation summary */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="text-center bg-[#0A0A0B]/60 border border-[#2A2A30]/30 rounded-lg py-4 px-3">
              <p className="text-lg font-medium text-primary mb-0.5">
                {appraisal.bottleCount.toLocaleString()}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Bottles appraised
              </p>
            </div>
            <div className="text-center bg-[#0A0A0B]/60 border border-[#2A2A30]/30 rounded-lg py-4 px-3">
              <p className="font-serif text-lg text-primary mb-0.5">
                {formatCurrency(appraisal.totalBasisUsd)}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted">
                Total basis
              </p>
            </div>
          </div>

          {/* Line items */}
          {appraisal.lineItems.length > 0 && (
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-4">
                Items appraised
              </p>
              <div className="divide-y divide-[#2A2A30]/40 border-y border-[#2A2A30]/40">
                {appraisal.lineItems.map((line) => (
                  <div
                    key={line.wineId}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-primary font-medium truncate">
                        {line.producer} · {line.name}
                      </p>
                      <p className="text-xs text-muted">
                        {line.vintage} · {line.region}
                        {line.ccrAnchor ? (
                          <span className="ml-2 text-gold-text">
                            Custody anchor: CCR {line.ccrAnchor}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <p className="text-sm text-primary font-medium whitespace-nowrap">
                      {formatCurrency(line.currentValueUsd)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Heirs (estate only) */}
          {appraisal.heirs.length > 0 && (
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-4">
                Estate heirs & shares
              </p>
              <div className="divide-y divide-[#2A2A30]/40 border-y border-[#2A2A30]/40">
                {appraisal.heirs.map((heir, i) => (
                  <div
                    key={i}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-primary">{heir.name}</span>
                    <span className="text-sm text-secondary">{heir.share}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Data integrity */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-muted text-center mb-3">
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
                {appraisal.dataIntegrityHash}
              </code>
            </div>
          </div>

          {/* QR */}
          <div className="flex flex-col items-center mb-8">
            <div className="bg-white rounded-lg p-2">
              <QRCodeSVG
                value={verifyUrl}
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

          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="h-px w-16 bg-gold/30" />
            <div className="text-gold text-xs">◈</div>
            <div className="h-px w-16 bg-gold/30" />
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted mb-2">
              Appraisal No.
            </p>
            <p className="font-mono text-sm text-gold-text tracking-wider mb-4">
              {appraisal.appraisalNumber}
            </p>
            <p className="text-xs text-muted">
              Issued {formatDate(appraisal.effectiveDate)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
