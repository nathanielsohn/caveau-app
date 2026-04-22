"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import {
  requestAcquisition,
  INITIAL_ACQUISITION_REQUEST_STATE,
  type AcquisitionRequestState,
} from "../actions";

type VintageMode = "any" | "exact" | "range";

export default function NewAcquisitionForm() {
  const [state, formAction] = useFormState<AcquisitionRequestState, FormData>(
    requestAcquisition,
    INITIAL_ACQUISITION_REQUEST_STATE,
  );
  const [vintageMode, setVintageMode] = useState<VintageMode>("exact");

  if (state.ok && state.acquisitionId) {
    return (
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start gap-3 mb-3">
          <CheckCircle2 className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ok mb-1">
              Submitted
            </p>
            <h2 className="font-serif text-xl text-primary">
              We&apos;re on the hunt.
            </h2>
          </div>
        </div>
        <p className="text-sm text-secondary mb-5 leading-relaxed">
          Our sommeliers will reach out with a quote as soon as we&apos;ve
          found a provenance-clean match. You can check status any time from
          your acquisitions list.
        </p>
        <Link
          href={`/acquisitions/${state.acquisitionId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          View request
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state.error && (
        <div className="px-4 py-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      {/* Producer + wine name */}
      <Section title="The bottle">
        <Field label="Producer" required>
          <input
            name="producer"
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Château Lafite Rothschild"
            className="input"
          />
        </Field>
        <Field label="Wine name" hint="Only if there's a specific cuvée.">
          <input
            name="wineName"
            type="text"
            maxLength={200}
            placeholder="e.g. Pauillac, Carruades, etc. Leave blank if any."
            className="input"
          />
        </Field>
      </Section>

      {/* Vintage mode */}
      <Section title="Vintage">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(["exact", "range", "any"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setVintageMode(m)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                vintageMode === m
                  ? "bg-gold/10 border-gold/40 text-gold"
                  : "border-[#2A2A30] text-secondary hover:text-primary"
              }`}
            >
              {m === "exact"
                ? "Exact year"
                : m === "range"
                  ? "Range"
                  : "Any vintage"}
            </button>
          ))}
        </div>
        {vintageMode === "exact" && (
          <Field label="Year">
            <input
              name="vintageExact"
              type="number"
              min={1800}
              max={new Date().getFullYear() + 1}
              placeholder="e.g. 2010"
              className="input"
            />
          </Field>
        )}
        {vintageMode === "range" && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="From">
              <input
                name="vintageMin"
                type="number"
                min={1800}
                max={new Date().getFullYear() + 1}
                placeholder="2015"
                className="input"
              />
            </Field>
            <Field label="To">
              <input
                name="vintageMax"
                type="number"
                min={1800}
                max={new Date().getFullYear() + 1}
                placeholder="2018"
                className="input"
              />
            </Field>
          </div>
        )}
        {vintageMode === "any" && (
          <p className="text-xs text-muted">
            We&apos;ll consider any vintage that meets your other criteria.
          </p>
        )}
      </Section>

      {/* Region / varietal / quantity / budget */}
      <Section title="Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Region" hint="Helps us widen the search if needed.">
            <input
              name="region"
              type="text"
              maxLength={200}
              placeholder="e.g. Pauillac"
              className="input"
            />
          </Field>
          <Field label="Varietal">
            <input
              name="varietal"
              type="text"
              maxLength={200}
              placeholder="e.g. Cabernet Sauvignon"
              className="input"
            />
          </Field>
          <Field label="Quantity" required>
            <input
              name="quantity"
              type="number"
              min={1}
              max={12}
              defaultValue={1}
              required
              className="input"
            />
          </Field>
          <Field
            label="Budget cap (USD)"
            hint="Per bottle or total — we'll confirm in the quote."
          >
            <input
              name="maxBudgetUsd"
              type="number"
              min={0}
              step={50}
              placeholder="Optional"
              className="input"
            />
          </Field>
        </div>
      </Section>

      {/* Note */}
      <Section title="Anything else?">
        <Field
          label="Note to the sourcing team"
          hint="Occasion, flexibility, condition requirements, deadline."
        >
          <textarea
            name="memberNote"
            rows={4}
            maxLength={1000}
            placeholder="e.g. For our 20th anniversary in September. Willing to stretch 10% for provenance."
            className="input resize-none"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/acquisitions"
          className="text-sm text-muted hover:text-primary transition-colors"
        >
          Cancel
        </Link>
        <SubmitButton />
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border-radius: 0.75rem;
          background-color: rgba(28, 28, 32, 0.8);
          border: 1px solid rgba(42, 42, 48, 0.6);
          color: var(--color-primary, #f5f5f0);
          font-size: 0.875rem;
          transition: border-color 0.2s;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(255, 209, 102, 0.5);
        }
        :global(.input::placeholder) {
          color: rgba(180, 180, 175, 0.5);
        }
      `}</style>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 transition-colors"
    >
      {pending ? "Submitting…" : "Submit request"}
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card p-5 md:p-6">
      <p className="text-[10px] uppercase tracking-widest text-muted mb-4">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-secondary mb-1.5">
        {label}
        {required && <span className="text-gold ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-muted mt-1">{hint}</span>}
    </label>
  );
}
