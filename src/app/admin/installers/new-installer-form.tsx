"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createInstaller,
  type InstallerFormState,
} from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-gold text-black text-sm font-medium hover:bg-gold/90 transition-colors disabled:opacity-60 w-full"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export default function NewInstallerForm() {
  const initialState: InstallerFormState = {
    submittedAt: null,
    ok: false,
    error: null,
    message: null,
  };
  const [state, formAction] = useFormState<InstallerFormState, FormData>(
    createInstaller,
    initialState,
  );

  return (
    <form action={formAction} className="glass-card p-6 md:p-8">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="font-serif text-lg text-primary">Add installer</h2>
          <p className="text-xs text-muted mt-1">
            Certified private location installer network entry.
          </p>
        </div>
        {state.submittedAt && state.ok && state.message && (
          <span className="badge-ok">{state.message}</span>
        )}
        {state.submittedAt && !state.ok && state.error && (
          <span className="badge-danger">{state.error}</span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" name="name" required placeholder="Jane Alvarez" />
        <Field label="Company" name="company" placeholder="Gulf Coast Cellarworks" />
        <Field label="Region" name="region" placeholder="Southwest Florida" />
        <Field label="Email" name="email" placeholder="installer@example.com" />
        <Field label="Phone" name="phone" placeholder="+1 (239) 555-0123" />
      </div>

      <div className="mt-6">
        <SubmitButton label="Add installer" />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1">
        {label}
        {required ? " *" : ""}
      </div>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full bg-caveau-graphite border border-[#2A2A30] rounded-xl px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-gold/60"
      />
    </label>
  );
}
