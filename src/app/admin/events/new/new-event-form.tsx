"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createEvent,
  INITIAL_EVENT_FORM_STATE,
  type EventFormState,
} from "../actions";

export default function NewEventForm() {
  const [state, formAction] = useFormState<EventFormState, FormData>(
    createEvent,
    INITIAL_EVENT_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="Naples Winter Wine Festival"
        />
      </Field>

      <Field
        label="Slug"
        htmlFor="slug"
        hint="Lowercase letters, digits, and dashes. Used in the public URL."
      >
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={80}
          pattern="[a-z0-9-]+"
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="naples-winter-wine-festival-2027"
        />
      </Field>

      <Field label="Summary (optional)" htmlFor="summary">
        <input
          id="summary"
          name="summary"
          type="text"
          maxLength={500}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="A three-day benefit weekend hosted by Caveau."
        />
      </Field>

      <Field label="Description (optional)" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={5000}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Starts at" htmlFor="startsAt">
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field label="Ends at" htmlFor="endsAt">
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
      </div>

      <Field label="Location name" htmlFor="locationName">
        <input
          id="locationName"
          name="locationName"
          type="text"
          required
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="The Ritz-Carlton, Naples"
        />
      </Field>

      <Field label="Location address (optional)" htmlFor="locationAddr">
        <input
          id="locationAddr"
          name="locationAddr"
          type="text"
          maxLength={300}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="280 Vanderbilt Beach Rd, Naples, FL 34108"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Capacity" htmlFor="capacity">
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            max={5000}
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field label="Price (USD per seat)" htmlFor="priceUsd">
          <input
            id="priceUsd"
            name="priceUsd"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue="published"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              name="memberOnly"
              value="on"
              className="w-4 h-4 rounded bg-[#1C1C20] border-[#2A2A30] text-gold focus:ring-gold/40"
            />
            Members only
          </label>
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
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
      {hint && <p className="text-[11px] text-muted mt-1.5">{hint}</p>}
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
      {pending ? "Creating…" : "Create event"}
    </button>
  );
}
