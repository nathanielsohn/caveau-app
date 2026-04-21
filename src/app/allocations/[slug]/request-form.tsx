"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  requestAllocation,
  INITIAL_ALLOCATION_REQUEST_STATE,
  type AllocationRequestState,
} from "../actions";

interface RequestFormProps {
  allocationId: string;
  maxQuantity: number;
}

export default function RequestForm({
  allocationId,
  maxQuantity,
}: RequestFormProps) {
  const [state, formAction] = useFormState<AllocationRequestState, FormData>(
    requestAllocation,
    INITIAL_ALLOCATION_REQUEST_STATE,
  );

  if (state.ok && state.confirmedQuantity != null) {
    const q = state.confirmedQuantity;
    return (
      <div className="glass-card p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-widest text-gold-text mb-2">
          Submitted
        </p>
        <p className="font-serif text-xl text-primary mb-1">
          {q} {q === 1 ? "bottle" : "bottles"} requested.
        </p>
        <p className="text-sm text-secondary">
          Your concierge will confirm within 48 hours. You&apos;ll be notified
          by email.
        </p>
      </div>
    );
  }

  const options = Array.from({ length: maxQuantity }, (_, i) => i + 1);

  return (
    <div className="glass-card p-6 md:p-8">
      <h2 className="font-serif text-xl text-primary mb-1">
        Request allocation
      </h2>
      <p className="text-xs text-muted mb-5">
        Non-binding expression of interest. Caveau confirms acceptance and
        bottle count before any charge.
      </p>

      {state.error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="allocationId" value={allocationId} />

        <div>
          <label
            htmlFor="quantityRequested"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Quantity
          </label>
          <select
            id="quantityRequested"
            name="quantityRequested"
            defaultValue={1}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          >
            {options.map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "bottle" : "bottles"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="memberNote"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Note to concierge (optional)
          </label>
          <textarea
            id="memberNote"
            name="memberNote"
            rows={3}
            maxLength={500}
            placeholder="Drinking window, pairing plans, delivery preferences…"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors resize-none"
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? "Submitting…" : "Request allocation"}
    </button>
  );
}
