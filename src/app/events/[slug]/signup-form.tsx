"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CheckCircle2 } from "lucide-react";
import {
  submitEventSignup,
  INITIAL_EVENT_SIGNUP_STATE,
  type EventSignupState,
} from "../actions";

export default function SignupForm({ slug }: { slug: string }) {
  const [state, formAction] = useFormState<EventSignupState, FormData>(
    submitEventSignup.bind(null, slug),
    INITIAL_EVENT_SIGNUP_STATE,
  );

  if (state.ok) {
    return <Confirmation name={state.confirmedName ?? "you"} />;
  }

  return (
    <div className="glass-card p-6 md:p-8">
      <h2 className="font-serif text-xl text-primary mb-1">
        Request an invitation
      </h2>
      <p className="text-sm text-secondary mb-5">
        We&apos;ll confirm your seat by email within 48 hours.
      </p>

      {state.error && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-5">
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

        <Field label="Anything we should know? (optional)" htmlFor="notes">
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary placeholder-muted text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 transition-colors resize-none"
            placeholder="Party size, interests, questions…"
          />
        </Field>

        <SubmitButton />
      </form>
    </div>
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
    <div className="glass-card p-6 md:p-8 flex flex-col items-center text-center">
      <CheckCircle2 className="w-12 h-12 text-ok mb-4" />
      <h2 className="font-serif text-2xl text-primary mb-2">
        Thank you, {first}.
      </h2>
      <p className="text-sm text-secondary max-w-sm">
        Your request is in. We&apos;ll reach out within 48 hours to confirm
        your seat and share arrival details.
      </p>
    </div>
  );
}
