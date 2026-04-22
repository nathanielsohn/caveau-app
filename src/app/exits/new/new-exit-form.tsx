"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2, Target } from "lucide-react";
import { ExitChannel } from "@prisma/client";
import {
  requestExitFacilitation,
  INITIAL_EXIT_REQUEST_STATE,
  type ExitRequestState,
} from "../actions";
import {
  CHANNEL_LABELS,
  CHANNEL_DESCRIPTION,
} from "@/lib/exits";

export interface WineOption {
  id: string;
  label: string;
  currentValueUsd: number;
}

export interface PreselectContext {
  wineId: string;
  wineLabel: string;
  currentValueUsd: number;
  /** Target range from the open exit signal on this wine, if any. Pre-fills the range inputs. */
  signalTargetLow: number | null;
  signalTargetHigh: number | null;
  signalRationale: string | null;
  signalStrength: "moderate" | "strong" | null;
}

const CHANNELS: readonly ExitChannel[] = [
  ExitChannel.auction,
  ExitChannel.broker,
  ExitChannel.private_sale,
  ExitChannel.self_handled,
];

/**
 * Member-facing exit request form. Wine is picked from a select of
 * in-cellar bottles that don't have an active facilitation. When we
 * arrive via `?wineId=X` (the #55 → #47 pivot), the form opens with
 * that bottle pre-selected and target range pre-filled from the open
 * exit signal's range.
 */
export default function NewExitForm({
  wines,
  preselect,
}: {
  wines: WineOption[];
  preselect: PreselectContext | null;
}) {
  const [state, formAction] = useFormState<ExitRequestState, FormData>(
    requestExitFacilitation,
    INITIAL_EXIT_REQUEST_STATE,
  );

  const [selectedWineId, setSelectedWineId] = useState<string>(
    preselect?.wineId ?? "",
  );

  const selectedWine = useMemo(
    () => wines.find((w) => w.id === selectedWineId) ?? null,
    [wines, selectedWineId],
  );

  if (state.ok && state.exitId) {
    return (
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start gap-3 mb-3">
          <CheckCircle2 className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-ok mb-1">
              Submitted
            </p>
            <h2 className="font-serif text-xl text-primary">
              We&apos;re on it.
            </h2>
          </div>
        </div>
        <p className="text-sm text-secondary mb-5 leading-relaxed">
          Your concierge will confirm channel and price band within two
          business days. You can follow the progress any time from your
          exits list.
        </p>
        <Link
          href={`/exits/${state.exitId}`}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          View request
        </Link>
      </div>
    );
  }

  if (wines.length === 0) {
    return (
      <div className="glass-card p-6 md:p-8">
        <p className="font-serif text-lg text-primary mb-2">
          Nothing to consign right now
        </p>
        <p className="text-sm text-secondary">
          Every in-cellar bottle either already has an active exit, or
          the collection is empty. Start at the collection or the
          dashboard to find a candidate.
        </p>
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

      {/* #55 context hint — only renders when arriving from a wine with
          an open exit signal. Gives the member the "why now" rationale
          inline so they don't need to click back. */}
      {preselect?.signalRationale && (
        <div className="glass-card p-5 border-burgundy/20">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-burgundy" />
            <span className="text-[10px] uppercase tracking-widest text-burgundy">
              {preselect.signalStrength === "strong"
                ? "Strong exit signal"
                : "Exit signal"}
            </span>
          </div>
          <p className="text-sm text-secondary leading-relaxed">
            {preselect.signalRationale}
          </p>
        </div>
      )}

      {/* Bottle picker */}
      <Section title="Bottle">
        <Field label="Select a bottle" required>
          <select
            name="wineId"
            required
            value={selectedWineId}
            onChange={(e) => setSelectedWineId(e.target.value)}
            className="input"
          >
            <option value="">Pick a bottle from your collection</option>
            {wines.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </Field>
        {selectedWine && (
          <p className="text-[11px] text-muted">
            Current value{" "}
            <span className="text-secondary tabular-nums">
              {formatUsdInline(selectedWine.currentValueUsd)}
            </span>{" "}
            · we&apos;ll price the consignment against live Liv-ex on
            listing.
          </p>
        )}
      </Section>

      {/* Target range */}
      <Section title="Target range (optional)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Low (USD)">
            <input
              name="targetPriceLow"
              type="number"
              min={0}
              step={10}
              defaultValue={
                preselect?.signalTargetLow != null
                  ? String(Math.round(preselect.signalTargetLow))
                  : ""
              }
              placeholder="Your floor"
              className="input"
            />
          </Field>
          <Field label="High (USD)">
            <input
              name="targetPriceHigh"
              type="number"
              min={0}
              step={10}
              defaultValue={
                preselect?.signalTargetHigh != null
                  ? String(Math.round(preselect.signalTargetHigh))
                  : ""
              }
              placeholder="Your ceiling"
              className="input"
            />
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          Frames our ask when we list. Leave blank to let us set the
          range off current valuation.
        </p>
      </Section>

      {/* Channel preference */}
      <Section title="Channel preference (optional)">
        <Field label="Preferred channel">
          <select name="preferredChannel" defaultValue="" className="input">
            <option value="">No preference — let concierge choose</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <p className="text-[11px] text-muted leading-relaxed">
          Non-binding hint. Your concierge will confirm the right route —
          auction house, broker, private sale, or a self-handled bundle
          you place yourself.
        </p>
      </Section>

      {/* Note */}
      <Section title="Anything else?">
        <Field
          label="Note to the concierge"
          hint="Urgency, preferred auction house, dealer relationships, tax considerations."
        >
          <textarea
            name="memberNote"
            rows={4}
            maxLength={1000}
            placeholder="e.g. Want this placed before the September sale at Sotheby's London if possible."
            className="input resize-none"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/exits"
          className="text-sm text-muted hover:text-primary transition-colors"
        >
          Cancel
        </Link>
        <SubmitButton />
      </div>

      {/* Channel explainer — small glossary the member can skim below the form */}
      <div className="glass-card p-5 md:p-6 mt-2">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
          Channels explained
        </p>
        <dl className="space-y-2 text-xs">
          {CHANNELS.map((c) => (
            <div key={c} className="flex gap-2">
              <dt className="text-secondary font-medium whitespace-nowrap min-w-[100px]">
                {CHANNEL_LABELS[c]}
              </dt>
              <dd className="text-muted leading-relaxed">
                {CHANNEL_DESCRIPTION[c]}
              </dd>
            </div>
          ))}
        </dl>
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
      <div className="space-y-3">{children}</div>
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
      {hint && (
        <span className="block text-[11px] text-muted mt-1">{hint}</span>
      )}
    </label>
  );
}

function formatUsdInline(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}
