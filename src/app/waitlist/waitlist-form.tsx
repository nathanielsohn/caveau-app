"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import {
  submitWaitlist,
  INITIAL_WAITLIST_STATE,
  type WaitlistSubmitState,
} from "./actions";

export default function WaitlistForm() {
  const [state, formAction] = useFormState<WaitlistSubmitState, FormData>(
    submitWaitlist,
    INITIAL_WAITLIST_STATE,
  );

  if (state.ok) {
    return <Confirmation name={state.confirmedName ?? "you"} />;
  }

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <Field label="Full Name" htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          autoCapitalize="words"
          required
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          placeholder="Jane Doe"
        />
      </Field>

      <Field label="Email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={254}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Phone (optional)" htmlFor="phone">
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={40}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          placeholder="+1 (555) 123-4567"
        />
      </Field>

      <Field label="How did you hear about Caveau?" htmlFor="source">
        <select
          id="source"
          name="source"
          defaultValue="website"
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
        >
          <option value="website">Website</option>
          <option value="naples-wine-festival">Naples Winter Wine Festival</option>
          <option value="referral">Referral from a member</option>
          <option value="press">Press</option>
          <option value="other">Other</option>
        </select>
      </Field>

      <Field label="Referred by (optional)" htmlFor="referredBy">
        <input
          id="referredBy"
          name="referredBy"
          type="text"
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors"
          placeholder="Member name or referral code"
        />
      </Field>

      <Field label="Anything we should know? (optional)" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors resize-none"
          placeholder="Collection size, interests, questions…"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs text-muted uppercase tracking-wider mb-2"
      >
        {label}
      </label>
      {children}
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
      {pending ? "Submitting…" : "Request an Invitation"}
    </button>
  );
}

function Confirmation({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0] || name;
  return (
    <div className="flex flex-col items-center text-center py-6">
      <CheckCircle2 size={48} className="text-ok mb-4" />
      <h2 className="font-serif text-2xl text-primary mb-2">
        Thank you, {first}.
      </h2>
      <p className="text-sm text-secondary max-w-sm">
        You&apos;re on the founding member waitlist. We&apos;ll be in touch before the
        Q3 2027 soft launch with an invitation to reserve your locker.
      </p>
      <p className="text-xs text-muted mt-6">
        See you at the Naples Winter Wine Festival, Jan 30 – Feb 1, 2027.
      </p>
    </div>
  );
}
