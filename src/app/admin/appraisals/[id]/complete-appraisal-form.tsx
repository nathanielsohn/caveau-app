"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, ScrollText } from "lucide-react";
import {
  completeAppraisal,
  INITIAL_COMPLETE_APPRAISAL_STATE,
  type CompleteAppraisalState,
} from "../actions";
import { formatCurrency } from "@/lib/utils";

interface Props {
  appraisalId: string;
  defaultAppraiserName: string;
  defaultAppraiserCreds: string;
  defaultScopeOfWork: string;
  previewBottleCount: number;
  previewTotalUsd: number;
}

export default function CompleteAppraisalForm({
  appraisalId,
  defaultAppraiserName,
  defaultAppraiserCreds,
  defaultScopeOfWork,
  previewBottleCount,
  previewTotalUsd,
}: Props) {
  const [state, formAction] = useFormState<CompleteAppraisalState, FormData>(
    completeAppraisal,
    INITIAL_COMPLETE_APPRAISAL_STATE,
  );

  // Default effective date = today (ISO YYYY-MM-DD) so the input renders
  // with a concrete value instead of a placeholder.
  const today = new Date().toISOString().slice(0, 10);

  if (state.ok && state.appraisalNumber) {
    return (
      <div className="glass-card p-5 md:p-6 border border-ok/30 bg-ok/5">
        <div className="flex items-start gap-3 mb-3">
          <CheckCircle2 className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ok mb-1">
              Completed
            </p>
            <p className="font-serif text-lg text-primary">
              {state.appraisalNumber} issued
            </p>
          </div>
        </div>
        <p className="text-sm text-secondary mb-4">
          The document is now visible to the member and verifiable by any
          third party. Reload the page to see the locked snapshot.
        </p>
        <Link
          href={`/admin/appraisals/${appraisalId}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
        >
          Refresh
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="glass-card p-5 md:p-6 border border-gold/20"
    >
      <input type="hidden" name="appraisalId" value={appraisalId} />

      <div className="flex items-center gap-2 mb-3">
        <ScrollText className="w-4 h-4 text-gold" />
        <p className="text-xs uppercase tracking-wider text-gold-text">
          Complete appraisal
        </p>
      </div>

      {state.error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <p className="text-sm text-secondary mb-5">
        Snapshot will capture{" "}
        <span className="text-primary">{previewBottleCount} bottles</span>{" "}
        totalling{" "}
        <span className="text-primary">{formatCurrency(previewTotalUsd)}</span>
        . Scope and portfolio values are re-read at submit time — if the
        member has changed their cellar, the latest state wins.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label
            htmlFor="appraiserName"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Appraiser name
          </label>
          <input
            type="text"
            id="appraiserName"
            name="appraiserName"
            required
            defaultValue={defaultAppraiserName}
            maxLength={200}
            className="w-full px-4 py-2.5 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </div>
        <div>
          <label
            htmlFor="effectiveDate"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Effective date
          </label>
          <input
            type="date"
            id="effectiveDate"
            name="effectiveDate"
            required
            defaultValue={today}
            className="w-full px-4 py-2.5 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </div>
      </div>

      <div className="mb-4">
        <label
          htmlFor="appraiserCreds"
          className="block text-xs text-muted uppercase tracking-wider mb-2"
        >
          Credentials
        </label>
        <input
          type="text"
          id="appraiserCreds"
          name="appraiserCreds"
          defaultValue={defaultAppraiserCreds}
          maxLength={500}
          className="w-full px-4 py-2.5 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
        />
      </div>

      <div className="mb-4">
        <label
          htmlFor="scopeOfWork"
          className="block text-xs text-muted uppercase tracking-wider mb-2"
        >
          Scope of work
        </label>
        <textarea
          id="scopeOfWork"
          name="scopeOfWork"
          rows={3}
          defaultValue={defaultScopeOfWork}
          maxLength={2000}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
        />
      </div>

      <div className="mb-5">
        <label
          htmlFor="staffNote"
          className="block text-xs text-muted uppercase tracking-wider mb-2"
        >
          Internal note (optional)
        </label>
        <textarea
          id="staffNote"
          name="staffNote"
          rows={2}
          maxLength={1000}
          placeholder="Anything ops should know — never shown to the member."
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
        />
      </div>

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Completing…" : "Complete & issue document"}
    </button>
  );
}
