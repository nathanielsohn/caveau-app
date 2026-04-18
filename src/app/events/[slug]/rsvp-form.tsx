"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import {
  rsvpToEvent,
  cancelRsvp,
  INITIAL_RSVP_STATE,
  type RsvpState,
} from "../actions";

interface RsvpFormProps {
  eventId: string;
  spotsRemaining: number;
  initialSeats: number | null;
  initialNotes: string | null;
}

export default function RsvpForm({
  eventId,
  spotsRemaining,
  initialSeats,
  initialNotes,
}: RsvpFormProps) {
  const [state, formAction] = useFormState<RsvpState, FormData>(
    rsvpToEvent,
    INITIAL_RSVP_STATE,
  );
  const [cancelState, cancelAction] = useFormState<RsvpState, FormData>(
    cancelRsvp,
    INITIAL_RSVP_STATE,
  );

  const currentlyConfirmed =
    state.ok && !state.cancelled
      ? state.confirmedSeats
      : cancelState.cancelled
        ? null
        : initialSeats;

  if (currentlyConfirmed) {
    return (
      <div className="glass-card p-6 md:p-8">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="w-12 h-12 text-ok mb-4" />
          <h2 className="font-serif text-2xl text-primary mb-2">
            You&apos;re on the list.
          </h2>
          <p className="text-sm text-secondary mb-6">
            {currentlyConfirmed === 1
              ? "One seat reserved in your name."
              : `${currentlyConfirmed} seats reserved in your name.`}
          </p>
          <form action={cancelAction} className="w-full max-w-xs">
            <input type="hidden" name="eventId" value={eventId} />
            <CancelButton />
          </form>
        </div>
      </div>
    );
  }

  if (spotsRemaining === 0) {
    return (
      <div className="glass-card p-6 md:p-8 text-center">
        <p className="font-serif text-xl text-primary mb-2">
          This event is fully subscribed.
        </p>
        <p className="text-sm text-secondary">
          Contact your concierge for the wait list.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 md:p-8">
      <h2 className="font-serif text-xl text-primary mb-4">RSVP</h2>
      {state.error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />

        <div>
          <label
            htmlFor="seats"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Seats
          </label>
          <select
            id="seats"
            name="seats"
            defaultValue={initialSeats ?? 1}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          >
            {[1, 2, 3, 4]
              .filter((n) => n <= spotsRemaining)
              .map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "seat" : "seats"}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-xs text-muted uppercase tracking-wider mb-2"
          >
            Notes (optional)
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={500}
            defaultValue={initialNotes ?? ""}
            placeholder="Dietary restrictions, guest name, special requests…"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors resize-none"
          />
        </div>

        <SubmitButton hasExisting={initialSeats != null} />
      </form>
    </div>
  );
}

function SubmitButton({ hasExisting }: { hasExisting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending
        ? "Submitting…"
        : hasExisting
          ? "Update RSVP"
          : "Confirm RSVP"}
    </button>
  );
}

function CancelButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-xl border border-[#2A2A30] text-secondary text-xs hover:text-primary hover:border-danger/40 disabled:opacity-50 transition-colors"
    >
      {pending ? "Cancelling…" : "Cancel my RSVP"}
    </button>
  );
}
