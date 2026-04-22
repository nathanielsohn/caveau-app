import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Play,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AppraisalStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  BASIS_LABELS,
  DEFAULT_APPRAISER,
  PURPOSE_LABELS,
  STATUS_LABELS,
  buildAppraisalSnapshot,
  parseHeirs,
  parseLineItems,
  resolveAppraisalPrice,
} from "@/lib/appraisals";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import CompleteAppraisalForm from "./complete-appraisal-form";
import AppraisalLifecycleActions from "./lifecycle-actions";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AppraisalStatus, string> = {
  submitted: "bg-gold/10 text-gold border-gold/30",
  in_progress: "bg-ok/10 text-ok border-ok/30",
  completed: "bg-ok/10 text-ok border-ok/30",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AdminAppraisalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  const { id } = await params;
  const appraisal = await prisma.appraisal.findUnique({
    where: { id },
    include: {
      member: {
        select: { id: true, name: true, email: true, tier: true, foundingMember: true },
      },
    },
  });
  if (!appraisal) notFound();

  const heirs = parseHeirs(appraisal.heirs);
  const storedScopedIds = Array.isArray(appraisal.scopedWineIds)
    ? appraisal.scopedWineIds.filter((v): v is string => typeof v === "string")
    : [];
  const storedLineItems = parseLineItems(appraisal.lineItems);

  // Live snapshot preview for submitted/in_progress appraisals so staff
  // can see what will be written before clicking Complete. For a
  // completed appraisal we show the frozen snapshot instead.
  const livePreview =
    appraisal.status === AppraisalStatus.submitted ||
    appraisal.status === AppraisalStatus.in_progress
      ? await buildAppraisalSnapshot({
          memberId: appraisal.memberId,
          scopedWineIds: storedScopedIds.length > 0 ? storedScopedIds : null,
        })
      : null;

  const priceDisplay = appraisal.isWelcomeAppraisal
    ? "Included"
    : appraisal.priceChargedUsd
      ? formatCurrency(toNumber(appraisal.priceChargedUsd))
      : resolveAppraisalPrice(appraisal.member.tier, false).priceDisplay;

  const canComplete =
    appraisal.status === AppraisalStatus.submitted ||
    appraisal.status === AppraisalStatus.in_progress;
  const canRevoke =
    appraisal.status === AppraisalStatus.completed && !appraisal.revokedAt;

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <Link
        href="/admin/appraisals"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to queue
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[appraisal.status]}`}
          >
            {STATUS_LABELS[appraisal.status]}
          </span>
          {appraisal.isWelcomeAppraisal && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-gold-text">
              <Sparkles className="w-3 h-3" />
              Founding welcome
            </span>
          )}
          {appraisal.revokedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-danger">
              <XCircle className="w-3 h-3" />
              Revoked
            </span>
          )}
        </div>
        <h1 className="font-serif text-3xl text-primary tracking-wide">
          {PURPOSE_LABELS[appraisal.purpose]} appraisal for{" "}
          {appraisal.member.name}
        </h1>
        <p className="text-sm text-muted mt-1">
          {appraisal.appraisalNumber ?? "No number assigned yet"}
          {" · "}
          {BASIS_LABELS[appraisal.basis]}
          {" · "}
          {priceDisplay}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted mb-2">
            Member
          </p>
          <p className="text-sm text-primary font-medium">
            {appraisal.member.name}
          </p>
          <p className="text-xs text-muted mt-0.5">{appraisal.member.email}</p>
          <p className="text-xs text-muted mt-0.5">
            {appraisal.member.tier} tier
            {appraisal.member.foundingMember ? " · Founding" : ""}
          </p>
        </div>

        <div className="glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted mb-2">
            Request
          </p>
          <p className="text-sm text-primary">
            Submitted {formatDate(appraisal.createdAt)}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Scope:{" "}
            {storedScopedIds.length > 0
              ? `${storedScopedIds.length} selected bottles`
              : "Entire collection"}
          </p>
        </div>

        {appraisal.memberNote && (
          <div className="glass-card p-5 md:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted mb-2">
              Member note
            </p>
            <p className="text-sm text-secondary italic">
              &ldquo;{appraisal.memberNote}&rdquo;
            </p>
          </div>
        )}

        {heirs.length > 0 && (
          <div className="glass-card p-5 md:col-span-2">
            <p className="text-xs uppercase tracking-wider text-muted mb-3">
              Estate heirs
            </p>
            <div className="divide-y divide-[#2A2A30]/40">
              {heirs.map((h, i) => (
                <div
                  key={i}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <span className="text-primary">{h.name}</span>
                  <span className="text-secondary">{h.share}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Scope preview / frozen snapshot */}
      {livePreview && (
        <div className="glass-card p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-xs uppercase tracking-wider text-muted">
              Live scope preview
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">
                {livePreview.bottleCount} bottles
              </span>
              <span className="font-serif text-primary">
                {formatCurrency(livePreview.totalBasisUsd)}
              </span>
            </div>
          </div>
          {livePreview.lineItems.length === 0 ? (
            <p className="text-sm text-muted">
              No bottles in scope — the member needs inventory (or a wider
              scope) before this can be completed.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto divide-y divide-[#2A2A30]/40 border-y border-[#2A2A30]/40">
              {livePreview.lineItems.map((line) => (
                <div
                  key={line.wineId}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-primary truncate">
                      {line.producer} · {line.name}
                    </p>
                    <p className="text-[11px] text-muted">
                      {line.vintage} · {line.region}
                    </p>
                  </div>
                  <span className="text-sm text-secondary whitespace-nowrap">
                    {formatCurrency(line.currentValueUsd)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {storedLineItems.length > 0 && appraisal.status === AppraisalStatus.completed && (
        <div className="glass-card p-5 md:p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-xs uppercase tracking-wider text-muted">
              Frozen snapshot (document-of-record)
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted">
                {appraisal.bottleCount ?? storedLineItems.length} bottles
              </span>
              <span className="font-serif text-primary">
                {formatCurrency(toNumber(appraisal.totalBasisUsd ?? 0))}
              </span>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[#2A2A30]/40 border-y border-[#2A2A30]/40">
            {storedLineItems.map((line) => (
              <div
                key={line.wineId}
                className="py-2.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-primary truncate">
                    {line.producer} · {line.name}
                  </p>
                  <p className="text-[11px] text-muted">
                    {line.vintage} · {line.region}
                    {line.ccrAnchor && (
                      <span className="ml-2 text-gold-text">
                        CCR {line.ccrAnchor}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm text-secondary whitespace-nowrap">
                  {formatCurrency(line.currentValueUsd)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-4">
        {canComplete && livePreview && livePreview.bottleCount > 0 && (
          <CompleteAppraisalForm
            appraisalId={appraisal.id}
            defaultAppraiserName={
              appraisal.appraiserName ?? DEFAULT_APPRAISER.name
            }
            defaultAppraiserCreds={
              appraisal.appraiserCreds ?? DEFAULT_APPRAISER.creds
            }
            defaultScopeOfWork={
              appraisal.scopeOfWork ?? DEFAULT_APPRAISER.scope
            }
            previewBottleCount={livePreview.bottleCount}
            previewTotalUsd={livePreview.totalBasisUsd}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <AppraisalLifecycleActions
            appraisalId={appraisal.id}
            status={appraisal.status}
            canRevoke={canRevoke}
          />

          {appraisal.status === AppraisalStatus.completed && (
            <a
              href={`/admin/appraisals/${appraisal.id}/pdf`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
            >
              <FileText className="w-4 h-4" />
              Download PDF
            </a>
          )}
        </div>
      </div>

      {appraisal.status === AppraisalStatus.completed && (
        <div className="mt-6 glass-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted mb-2">
            Document integrity
          </p>
          <p className="text-[11px] text-muted mb-2">
            SHA-256 HMAC over (id, memberId, effectiveDate, purpose, basis,
            totalBasis). Public verify URL links to the detail shown at{" "}
            <span className="font-mono">
              /verify/appraisal/{appraisal.dataIntegrityHash?.slice(0, 12)}…
            </span>
          </p>
          <code className="block text-[11px] text-secondary break-all font-mono">
            {appraisal.dataIntegrityHash}
          </code>
        </div>
      )}

      {appraisal.completedAt && (
        <p className="text-xs text-muted mt-4">
          Completed {formatDate(appraisal.completedAt)} · Play{" "}
          <Play className="inline w-3 h-3" /> review in member view at{" "}
          <Link
            href={`/appraisals/${appraisal.id}`}
            className="text-gold hover:text-gold/80"
          >
            /appraisals/{appraisal.id.slice(0, 8)}
          </Link>
        </p>
      )}
    </div>
  );
}
