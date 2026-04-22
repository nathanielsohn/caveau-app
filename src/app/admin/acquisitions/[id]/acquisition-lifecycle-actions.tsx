"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AcquisitionStatus } from "@prisma/client";
import {
  declineAcquisition,
  INITIAL_ADMIN_ACQUISITION_STATE,
  startSourcing,
  updateAcquisitionNote,
  type AdminAcquisitionFormState,
} from "../actions";

interface Props {
  acquisitionId: string;
  status: AcquisitionStatus;
  currentStaffNote: string | null;
}

/**
 * Status-change actions on the admin detail page. Fulfill gets its own
 * richer form (fulfill-form.tsx) — this component handles the three
 * simpler transitions: start sourcing, decline, and edit the staff
 * note without changing status.
 */
export default function AcquisitionLifecycleActions({
  acquisitionId,
  status,
  currentStaffNote,
}: Props) {
  const [startState, startAction] = useFormState<
    AdminAcquisitionFormState,
    FormData
  >(startSourcing, INITIAL_ADMIN_ACQUISITION_STATE);
  const [declineState, declineAction] = useFormState<
    AdminAcquisitionFormState,
    FormData
  >(declineAcquisition, INITIAL_ADMIN_ACQUISITION_STATE);
  const [noteState, noteAction] = useFormState<
    AdminAcquisitionFormState,
    FormData
  >(updateAcquisitionNote, INITIAL_ADMIN_ACQUISITION_STATE);

  const err =
    startState.error ?? declineState.error ?? noteState.error ?? null;
  const ok =
    startState.message ??
    declineState.message ??
    noteState.message ??
    null;

  const terminal =
    status === AcquisitionStatus.fulfilled ||
    status === AcquisitionStatus.declined ||
    status === AcquisitionStatus.cancelled;

  if (terminal) {
    return (
      <div className="glass-card p-5">
        <p className="text-xs text-muted">
          This request is {status} — no further actions available.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {err}
        </div>
      )}
      {ok && !err && (
        <div className="px-3 py-2 rounded-lg bg-ok/10 border border-ok/20 text-ok text-xs">
          {ok}
        </div>
      )}

      {status === AcquisitionStatus.requested && (
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
            Start sourcing
          </p>
          <p className="text-xs text-secondary mb-3">
            Flip to sourcing + capture a working quote for the member.
          </p>
          <form action={startAction} className="space-y-3">
            <input
              type="hidden"
              name="acquisitionId"
              value={acquisitionId}
            />
            <label className="block">
              <span className="block text-xs text-muted mb-1">
                Estimated total (USD, optional)
              </span>
              <input
                name="estimatedTotalUsd"
                type="number"
                min={0}
                step={10}
                placeholder="Leave blank to move forward without a quote"
                className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">
                Note to member (optional)
              </span>
              <textarea
                name="staffNote"
                rows={2}
                maxLength={1000}
                placeholder="What you're seeing in the market, ETA, caveats."
                className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
              />
            </label>
            <GoldSubmit label="Start sourcing" pendingLabel="Starting…" />
          </form>
        </div>
      )}

      {status === AcquisitionStatus.sourcing && (
        <div className="glass-card p-5">
          <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
            Update sourcing note
          </p>
          <p className="text-xs text-secondary mb-3">
            Visible to the member on their detail page — use to keep them
            in the loop while you work the market.
          </p>
          <form action={noteAction} className="space-y-3">
            <input
              type="hidden"
              name="acquisitionId"
              value={acquisitionId}
            />
            <textarea
              name="staffNote"
              rows={3}
              maxLength={1000}
              defaultValue={currentStaffNote ?? ""}
              placeholder="e.g. Broker has 2015 at $1,240. Auction 2016 estimate $1,050–$1,250."
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
            <GhostSubmit label="Save note" pendingLabel="Saving…" />
          </form>
        </div>
      )}

      <div className="glass-card p-5">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
          Decline
        </p>
        <p className="text-xs text-secondary mb-3">
          Close out the request when there&apos;s no match in the market
          or the member&apos;s brief is out of scope. The note is
          required and shown to the member.
        </p>
        <form action={declineAction} className="space-y-3">
          <input type="hidden" name="acquisitionId" value={acquisitionId} />
          <textarea
            name="staffNote"
            rows={2}
            maxLength={1000}
            required
            placeholder="Reason — e.g. No provenance-clean bottles at the member's target."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
          <DangerSubmit label="Decline request" pendingLabel="Declining…" />
        </form>
      </div>
    </div>
  );
}

function GoldSubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl bg-gold text-caveau-black text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function GhostSubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-xs hover:text-primary hover:border-gold/40 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function DangerSubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-xs hover:text-danger hover:border-danger/40 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
