"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  updateEvent,
  INITIAL_EVENT_FORM_STATE,
  type EventFormState,
} from "../actions";

interface InitialEvent {
  title: string;
  slug: string;
  summary: string | null;
  description: string | null;
  locationName: string;
  locationAddr: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  priceUsd: number;
  memberOnly: boolean;
  status: "draft" | "published" | "cancelled";
}

export default function EditEventForm({
  id,
  initial,
}: {
  id: string;
  initial: InitialEvent;
}) {
  const [state, formAction] = useFormState<EventFormState, FormData>(
    updateEvent.bind(null, id),
    INITIAL_EVENT_FORM_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}
      {state.ok && (
        <div className="px-4 py-3 rounded-xl bg-ok/10 border border-ok/20 text-ok text-sm">
          Saved.
        </div>
      )}

      <Field label="Title" htmlFor="title">
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={initial.title}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
        />
      </Field>

      <Field label="Slug" htmlFor="slug">
        <input
          id="slug"
          name="slug"
          type="text"
          required
          maxLength={80}
          pattern="[a-z0-9-]+"
          defaultValue={initial.slug}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
        />
      </Field>

      <Field label="Summary" htmlFor="summary">
        <input
          id="summary"
          name="summary"
          type="text"
          maxLength={500}
          defaultValue={initial.summary ?? ""}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
        />
      </Field>

      <Field label="Description" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={5000}
          defaultValue={initial.description ?? ""}
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
            defaultValue={initial.startsAt}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field label="Ends at" htmlFor="endsAt">
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            defaultValue={initial.endsAt}
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
          defaultValue={initial.locationName}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
        />
      </Field>

      <Field label="Location address" htmlFor="locationAddr">
        <input
          id="locationAddr"
          name="locationAddr"
          type="text"
          maxLength={300}
          defaultValue={initial.locationAddr ?? ""}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
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
            defaultValue={initial.capacity}
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
            required
            defaultValue={initial.priceUsd}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={initial.status}
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
              defaultChecked={initial.memberOnly}
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
      {pending ? "Saving…" : "Save changes"}
    </button>
  );
}
