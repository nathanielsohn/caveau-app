import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, FileText, ShieldCheck } from "lucide-react";
import { AppraisalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  BASIS_LABELS,
  PURPOSE_LABELS,
  STATUS_LABELS,
  parseHeirs,
  parseLineItems,
} from "@/lib/appraisals";
import AppraisalDoc from "@/components/appraisal-doc";
import CancelRequestButton from "./cancel-request-button";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  in_progress: "bg-ok/10 text-ok border-ok/30",
  completed: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AppraisalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  const memberId = session.user.id;

  const { id } = await params;
  const appraisal = await prisma.appraisal.findFirst({
    where: { id, memberId },
    include: {
      member: { select: { name: true } },
    },
  });
  if (!appraisal) notFound();

  const isCompleted =
    appraisal.status === AppraisalStatus.completed &&
    appraisal.dataIntegrityHash &&
    appraisal.appraisalNumber &&
    appraisal.effectiveDate;

  const heirs = parseHeirs(appraisal.heirs);
  const lineItems = parseLineItems(appraisal.lineItems);

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/appraisals"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to appraisals
      </Link>

      {isCompleted ? (
        <>
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-1">
                Caveau Appraisal
              </p>
              <p className="font-mono text-sm text-gold-text">
                {appraisal.appraisalNumber}
              </p>
            </div>
            <a
              href={`/api/appraisals/${appraisal.id}/pdf`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Download PDF
            </a>
          </div>
          <AppraisalDoc
            appraisal={{
              appraisalNumber: appraisal.appraisalNumber!,
              memberName: appraisal.member.name,
              purpose: appraisal.purpose,
              basis: appraisal.basis,
              effectiveDate: appraisal.effectiveDate!,
              appraiserName: appraisal.appraiserName ?? "",
              appraiserCreds: appraisal.appraiserCreds ?? null,
              scopeOfWork: appraisal.scopeOfWork ?? null,
              bottleCount: appraisal.bottleCount ?? lineItems.length,
              totalBasisUsd: toNumber(appraisal.totalBasisUsd ?? 0),
              lineItems,
              heirs,
              dataIntegrityHash: appraisal.dataIntegrityHash!,
              isWelcomeAppraisal: appraisal.isWelcomeAppraisal,
            }}
          />
        </>
      ) : (
        <PendingState
          status={appraisal.status}
          purpose={PURPOSE_LABELS[appraisal.purpose]}
          basis={BASIS_LABELS[appraisal.basis]}
          memberNote={appraisal.memberNote}
          createdAt={appraisal.createdAt}
          isWelcome={appraisal.isWelcomeAppraisal}
          priceCharged={
            appraisal.priceChargedUsd
              ? toNumber(appraisal.priceChargedUsd)
              : null
          }
          heirs={heirs}
          scopedCount={
            Array.isArray(appraisal.scopedWineIds)
              ? appraisal.scopedWineIds.length
              : null
          }
          cancellable={
            appraisal.status === AppraisalStatus.submitted ||
            appraisal.status === AppraisalStatus.in_progress
          }
          appraisalId={appraisal.id}
        />
      )}
    </div>
  );

  function PendingState({
    status,
    purpose,
    basis,
    memberNote,
    createdAt,
    isWelcome,
    priceCharged,
    heirs,
    scopedCount,
    cancellable,
    appraisalId,
  }: {
    status: AppraisalStatus;
    purpose: string;
    basis: string;
    memberNote: string | null;
    createdAt: Date;
    isWelcome: boolean;
    priceCharged: number | null;
    heirs: { name: string; share: string }[];
    scopedCount: number | null;
    cancellable: boolean;
    appraisalId: string;
  }) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {STATUS_LABELS[status]}
          </span>
          {isWelcome && (
            <span className="text-[10px] uppercase tracking-widest text-gold-text">
              Founding Circle welcome
            </span>
          )}
        </div>

        <h1 className="font-serif text-3xl text-primary tracking-wide mb-4">
          {purpose} appraisal
        </h1>

        {status === AppraisalStatus.cancelled ? (
          <div className="glass-card p-6">
            <p className="text-sm text-secondary">
              This request was cancelled. Request a new appraisal from{" "}
              <Link
                href="/appraisals/new"
                className="text-gold hover:text-gold/80"
              >
                the appraisals list
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="glass-card p-6">
            <div className="flex items-start gap-3 mb-3">
              <Clock className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-1">
                  {status === AppraisalStatus.submitted
                    ? "In review"
                    : "Being drafted"}
                </p>
                <p className="font-serif text-lg text-primary">
                  {status === AppraisalStatus.submitted
                    ? "Awaiting your head sommelier"
                    : "Document in progress"}
                </p>
              </div>
            </div>
            <p className="text-sm text-secondary leading-relaxed">
              {status === AppraisalStatus.submitted
                ? "We'll confirm scope within two business days, then ship the signed, hash-verifiable PDF within five."
                : "Your appraiser has started drafting. You'll receive an email when it's ready to sign."}
            </p>
          </div>
        )}

        <div className="glass-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
            Request details
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted mb-1">Basis</dt>
              <dd className="text-primary">{basis}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted mb-1">Submitted</dt>
              <dd className="text-primary">{formatDate(createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted mb-1">Scope</dt>
              <dd className="text-primary">
                {scopedCount && scopedCount > 0
                  ? `${scopedCount} selected bottles`
                  : "Entire collection"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted mb-1">Cost</dt>
              <dd className="text-primary">
                {isWelcome
                  ? "Included"
                  : priceCharged !== null
                    ? formatCurrency(priceCharged)
                    : "—"}
              </dd>
            </div>
          </dl>

          {memberNote && (
            <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
              <p className="text-xs text-muted mb-1">Your note</p>
              <p className="text-sm text-secondary italic">
                &ldquo;{memberNote}&rdquo;
              </p>
            </div>
          )}

          {heirs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
              <p className="text-xs text-muted mb-2">Heirs</p>
              <ul className="space-y-1">
                {heirs.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-primary">{h.name}</span>
                    <span className="text-secondary">{h.share}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {cancellable && (
          <CancelRequestButton appraisalId={appraisalId} />
        )}

        <div className="glass-card p-6">
          <div className="flex items-start gap-3 mb-2">
            <ShieldCheck className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
            <p className="font-serif text-lg text-primary">
              What comes next
            </p>
          </div>
          <p className="text-sm text-secondary leading-relaxed">
            The finished appraisal lands back here as a signed PDF with a
            SHA-256 data integrity hash, a public verify URL, and custody
            anchors referencing the CCRs we hold for each bottle.
          </p>
        </div>
      </div>
    );
  }
}
