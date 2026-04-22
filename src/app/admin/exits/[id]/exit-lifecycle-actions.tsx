"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ExitStatus } from "@prisma/client";
import {
  withdrawExit,
  updateExitNote,
  INITIAL_ADMIN_EXIT_STATE,
  type AdminExitFormState,
} from "../actions";

interface Props {
  exitId: string;
  status: ExitStatus;
  currentStaffNote: string | null;
}

/**
 * Shared admin actions on the exit detail page — withdraw (valid from
 * `requested` or `listed`) + note edit. List + sell get their own
 * richer forms next door because they capture structured data.
 */
export default function ExitLifecycleActions({
  exitId,
  status,
  currentStaffNote,
}: Props) {
  const [withdrawState, withdrawAction] = useFormState<
    AdminExitFormState,
    FormData
  >(withdrawExit, INITIAL_ADMIN_EXIT_STATE);
  const [noteState, noteAction] = useFormState<
    AdminExitFormState,
    FormData
  >(updateExitNote, INITIAL_ADMIN_EXIT_STATE);

  const err = withdrawState.error ?? noteState.error ?? null;
  const ok = withdrawState.message ?? noteState.message ?? null;

  const terminal =
    status === ExitStatus.sold ||
    status === ExitStatus.withdrawn ||
    status === ExitStatus.cancelled;

  if (terminal) {
    return (
      <div className="glass-card p-5">
        <p className="text-xs text-muted">
          This exit is {status} — no further actions available.
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

      <div className="glass-card p-5">
        <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
          Note to member
        </p>
        <p className="text-xs text-secondary mb-3">
          Surfaces on the member&apos;s exit detail page — use to share
          channel options, pricing context, or timing.
        </p>
        <form action={noteAction} className="space-y-3">
          <input type="hidden" name="exitId" value={exitId} />
          <textarea
            name="staffNote"
            rows={3}
            maxLength={1000}
            defaultValue={currentStaffNote ?? ""}
            placeholder="e.g. Sotheby's Sept sale closes in 10 days. We'd target the low end of your range to place confidently."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
          <GhostSubmit label="Save note" pendingLabel="Saving…" />
        </form>
      </div>

      <div className="glass-card p-5">
        <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
          Withdraw
        </p>
        <p className="text-xs text-secondary mb-3">
          Pull the listing or close the request when the lot can&apos;t
          be placed. Reason is required and shown to the member.
        </p>
        <form action={withdrawAction} className="space-y-3">
          <input type="hidden" name="exitId" value={exitId} />
          <textarea
            name="reason"
            rows={2}
            maxLength={1000}
            required
            placeholder="e.g. Sotheby's declined the consignment — bottle fill level below their intake threshold."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
          <DangerSubmit label="Withdraw" pendingLabel="Withdrawing…" />
        </form>
      </div>
    </div>
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
