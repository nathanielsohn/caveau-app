"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AppraisalBasis, AppraisalPurpose } from "@prisma/client";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  requestAppraisal,
  INITIAL_APPRAISAL_REQUEST_STATE,
  type AppraisalRequestState,
} from "../actions";
import {
  BASIS_DESCRIPTIONS,
  BASIS_LABELS,
  PURPOSE_LABELS,
} from "@/lib/appraisals";
import { formatCurrency } from "@/lib/utils";

export interface PortfolioWineLite {
  id: string;
  name: string;
  producer: string;
  vintage: number;
  region: string;
  currentValueUsd: number;
}

interface Props {
  wines: PortfolioWineLite[];
  applyWelcome: boolean;
  paidPriceDisplay: string;
}

const PURPOSE_ORDER: AppraisalPurpose[] = [
  AppraisalPurpose.insurance,
  AppraisalPurpose.estate,
  AppraisalPurpose.tax_donation,
  AppraisalPurpose.divorce,
  AppraisalPurpose.gift,
  AppraisalPurpose.personal,
];

const BASIS_ORDER: AppraisalBasis[] = [
  AppraisalBasis.fair_market_value,
  AppraisalBasis.retail_replacement,
  AppraisalBasis.auction_estimate,
];

const PURPOSE_BASIS_DEFAULT: Record<AppraisalPurpose, AppraisalBasis> = {
  [AppraisalPurpose.insurance]: AppraisalBasis.fair_market_value,
  [AppraisalPurpose.estate]: AppraisalBasis.fair_market_value,
  [AppraisalPurpose.tax_donation]: AppraisalBasis.fair_market_value,
  [AppraisalPurpose.divorce]: AppraisalBasis.fair_market_value,
  [AppraisalPurpose.gift]: AppraisalBasis.fair_market_value,
  [AppraisalPurpose.personal]: AppraisalBasis.fair_market_value,
};

export default function NewAppraisalForm({
  wines,
  applyWelcome,
  paidPriceDisplay,
}: Props) {
  const [state, formAction] = useFormState<AppraisalRequestState, FormData>(
    requestAppraisal,
    INITIAL_APPRAISAL_REQUEST_STATE,
  );

  const [purpose, setPurpose] = useState<AppraisalPurpose>(
    AppraisalPurpose.insurance,
  );
  const [basis, setBasis] = useState<AppraisalBasis>(
    PURPOSE_BASIS_DEFAULT[AppraisalPurpose.insurance],
  );
  const [scopeMode, setScopeMode] = useState<"full" | "scoped">("full");
  const [scopedIds, setScopedIds] = useState<Set<string>>(new Set());
  const [heirs, setHeirs] = useState<{ name: string; share: string }[]>([
    { name: "", share: "" },
  ]);

  const portfolioTotal = useMemo(
    () => wines.reduce((sum, w) => sum + w.currentValueUsd, 0),
    [wines],
  );

  const scopedTotal = useMemo(
    () =>
      wines
        .filter((w) => scopedIds.has(w.id))
        .reduce((sum, w) => sum + w.currentValueUsd, 0),
    [wines, scopedIds],
  );

  function handlePurposeChange(next: AppraisalPurpose) {
    setPurpose(next);
    setBasis(PURPOSE_BASIS_DEFAULT[next]);
  }

  function toggleWine(id: string) {
    setScopedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateHeir(
    index: number,
    field: "name" | "share",
    value: string,
  ) {
    setHeirs((prev) =>
      prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
    );
  }

  function addHeir() {
    setHeirs((prev) => [...prev, { name: "", share: "" }]);
  }

  function removeHeir(index: number) {
    setHeirs((prev) => prev.filter((_, i) => i !== index));
  }

  if (state.ok && state.appraisalId) {
    return (
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start gap-3 mb-3">
          <CheckCircle2 className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ok mb-1">
              Submitted
            </p>
            <h2 className="font-serif text-xl text-primary">
              Your request is in queue.
            </h2>
          </div>
        </div>
        <p className="text-sm text-secondary mb-5 leading-relaxed">
          Our head sommelier will email you within two business days to
          confirm scope, then ship the signed document within five. You can
          review status any time from your appraisals list.
        </p>
        <Link
          href={`/appraisals/${state.appraisalId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          View appraisal
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      {applyWelcome && (
        <input type="hidden" name="requestWelcome" value="true" />
      )}

      {/* Purpose */}
      <fieldset className="glass-card p-5 md:p-6">
        <legend className="px-2 text-xs text-muted uppercase tracking-wider">
          Purpose
        </legend>
        <input type="hidden" name="purpose" value={purpose} />
        <div className="grid grid-cols-2 gap-2">
          {PURPOSE_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handlePurposeChange(p)}
              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                purpose === p
                  ? "bg-gold/10 border-gold/40 text-gold"
                  : "border-[#2A2A30] text-secondary hover:text-primary hover:border-[#2A2A30]/80"
              }`}
            >
              {PURPOSE_LABELS[p]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Basis */}
      <fieldset className="glass-card p-5 md:p-6">
        <legend className="px-2 text-xs text-muted uppercase tracking-wider">
          Basis
        </legend>
        <input type="hidden" name="basis" value={basis} />
        <div className="space-y-2">
          {BASIS_ORDER.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBasis(b)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                basis === b
                  ? "bg-gold/10 border-gold/40"
                  : "border-[#2A2A30] hover:border-[#2A2A30]/80"
              }`}
            >
              <p
                className={`text-sm font-medium ${basis === b ? "text-gold" : "text-primary"}`}
              >
                {BASIS_LABELS[b]}
              </p>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                {BASIS_DESCRIPTIONS[b]}
              </p>
            </button>
          ))}
        </div>
      </fieldset>

      {/* Scope */}
      <fieldset className="glass-card p-5 md:p-6">
        <legend className="px-2 text-xs text-muted uppercase tracking-wider">
          Scope
        </legend>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setScopeMode("full")}
            className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              scopeMode === "full"
                ? "bg-gold/10 border-gold/40 text-gold"
                : "border-[#2A2A30] text-secondary hover:text-primary"
            }`}
          >
            Entire collection ({wines.length})
          </button>
          <button
            type="button"
            onClick={() => setScopeMode("scoped")}
            className={`flex-1 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              scopeMode === "scoped"
                ? "bg-gold/10 border-gold/40 text-gold"
                : "border-[#2A2A30] text-secondary hover:text-primary"
            }`}
          >
            Select bottles
          </button>
        </div>

        {scopeMode === "full" ? (
          <p className="text-sm text-secondary">
            All {wines.length} bottles currently in cellar · estimated total{" "}
            <span className="text-primary">{formatCurrency(portfolioTotal)}</span>
          </p>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">
              {scopedIds.size} selected · estimated total{" "}
              <span className="text-primary">{formatCurrency(scopedTotal)}</span>
            </p>
            <div className="max-h-72 overflow-y-auto border border-[#2A2A30]/50 rounded-xl divide-y divide-[#2A2A30]/30">
              {wines.map((w) => {
                const checked = scopedIds.has(w.id);
                return (
                  <label
                    key={w.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#1C1C20]/40 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      name="scopedWineIds"
                      value={w.id}
                      checked={checked}
                      onChange={() => toggleWine(w.id)}
                      className="w-4 h-4 accent-[#FFD166]"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-primary truncate">
                        {w.producer}
                      </p>
                      <p className="text-xs text-muted truncate">
                        {w.name} · {w.vintage} · {w.region}
                      </p>
                    </div>
                    <span className="text-xs text-secondary whitespace-nowrap">
                      {formatCurrency(w.currentValueUsd)}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </fieldset>

      {/* Heirs — estate only */}
      {purpose === AppraisalPurpose.estate && (
        <fieldset className="glass-card p-5 md:p-6">
          <legend className="px-2 text-xs text-muted uppercase tracking-wider">
            Heirs & shares
          </legend>
          <p className="text-xs text-muted mb-4">
            At least one heir is required for an estate appraisal. Enter
            each share as a percentage or a written description (e.g.
            &quot;25% of residual&quot;, &quot;All Bordeaux first-growth
            holdings&quot;).
          </p>
          <div className="space-y-3">
            {heirs.map((heir, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    name="heirName"
                    value={heir.name}
                    onChange={(e) => updateHeir(i, "name", e.target.value)}
                    placeholder="Heir name"
                    maxLength={200}
                    className="px-3 py-2.5 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
                  />
                  <input
                    type="text"
                    name="heirShare"
                    value={heir.share}
                    onChange={(e) => updateHeir(i, "share", e.target.value)}
                    placeholder="Share (e.g. 50%)"
                    maxLength={200}
                    className="px-3 py-2.5 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
                  />
                </div>
                {heirs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeHeir(i)}
                    aria-label="Remove heir"
                    className="p-2.5 rounded-xl border border-[#2A2A30]/50 text-muted hover:text-danger hover:border-danger/30 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addHeir}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add heir
          </button>
        </fieldset>
      )}

      {/* Member note */}
      <fieldset className="glass-card p-5 md:p-6">
        <legend className="px-2 text-xs text-muted uppercase tracking-wider">
          Note to appraiser (optional)
        </legend>
        <textarea
          name="memberNote"
          rows={3}
          maxLength={1000}
          placeholder="Deadlines, specific policy requirements, attorney name…"
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors resize-none"
        />
      </fieldset>

      {/* Submit */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-muted">
          {applyWelcome
            ? "Included with your Founding Circle membership."
            : `${paidPriceDisplay} charged on document delivery.`}
        </p>
        <SubmitButton applyWelcome={applyWelcome} />
      </div>
    </form>
  );
}

function SubmitButton({ applyWelcome }: { applyWelcome: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending
        ? "Submitting…"
        : applyWelcome
          ? "Claim welcome appraisal"
          : "Request appraisal"}
    </button>
  );
}
