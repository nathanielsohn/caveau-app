"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  createAllocation,
  INITIAL_ADMIN_ALLOCATION_STATE,
  type AdminAllocationFormState,
} from "../actions";

export default function NewAllocationForm() {
  const [state, formAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(createAllocation, INITIAL_ADMIN_ALLOCATION_STATE);

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <div className="px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
          {state.error}
        </div>
      )}

      <Field label="Producer" htmlFor="producer">
        <input
          id="producer"
          name="producer"
          type="text"
          required
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="Domaine de la Romanée-Conti"
        />
      </Field>

      <Field label="Wine name" htmlFor="wineName">
        <input
          id="wineName"
          name="wineName"
          type="text"
          required
          maxLength={200}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="Romanée-Conti"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Vintage" htmlFor="vintage">
          <input
            id="vintage"
            name="vintage"
            type="number"
            required
            min={1800}
            max={new Date().getFullYear() + 1}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field
          label="Slug"
          htmlFor="slug"
          hint="Lowercase letters, digits, and dashes."
        >
          <input
            id="slug"
            name="slug"
            type="text"
            required
            maxLength={80}
            pattern="[a-z0-9-]+"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
            placeholder="drc-romanee-conti-2021"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Region" htmlFor="region">
          <input
            id="region"
            name="region"
            type="text"
            required
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
            placeholder="Burgundy"
          />
        </Field>
        <Field label="Varietal" htmlFor="varietal">
          <input
            id="varietal"
            name="varietal"
            type="text"
            required
            maxLength={200}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
            placeholder="Pinot Noir"
          />
        </Field>
      </div>

      <Field label="Description (optional)" htmlFor="description">
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={5000}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
        />
      </Field>

      <Field label="Tasting notes (optional)" htmlFor="tastingNotes">
        <textarea
          id="tastingNotes"
          name="tastingNotes"
          rows={3}
          maxLength={5000}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25 resize-none"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Quantity (bottles)" htmlFor="quantity">
          <input
            id="quantity"
            name="quantity"
            type="number"
            required
            min={1}
            max={1000}
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field label="Price per bottle (USD)" htmlFor="pricePerBottleUsd">
          <input
            id="pricePerBottleUsd"
            name="pricePerBottleUsd"
            type="number"
            required
            min={0}
            step="0.01"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Opens at" htmlFor="opensAt">
          <input
            id="opensAt"
            name="opensAt"
            type="datetime-local"
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
        <Field label="Closes at" htmlFor="closesAt">
          <input
            id="closesAt"
            name="closesAt"
            type="datetime-local"
            required
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field label="Minimum tier" htmlFor="minimumTier">
          <select
            id="minimumTier"
            name="minimumTier"
            defaultValue="platinum"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          >
            <option value="gold">Collector</option>
            <option value="reserve">Reserve</option>
            <option value="platinum">Private Vault</option>
            <option value="black">Estate</option>
          </select>
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue="draft"
            className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          >
            <option value="draft">Draft</option>
            <option value="published">Publish immediately</option>
          </select>
        </Field>
      </div>

      <Field
        label="Hero image key (optional)"
        htmlFor="heroImageKey"
        hint="S3 object key. Paste from the bucket if you have one uploaded."
      >
        <input
          id="heroImageKey"
          name="heroImageKey"
          type="text"
          maxLength={512}
          className="w-full px-4 py-3 rounded-xl bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/25"
          placeholder="allocations/drc-2021.jpg"
        />
      </Field>

      <div className="flex flex-col gap-3 pt-2">
        <label className="inline-flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            name="foundingOnly"
            value="on"
            className="w-4 h-4 rounded bg-[#1C1C20] border-[#2A2A30] text-gold focus:ring-gold/40"
          />
          Founding members only
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            name="foundingEarlyAccess"
            value="on"
            className="w-4 h-4 rounded bg-[#1C1C20] border-[#2A2A30] text-gold focus:ring-gold/40"
          />
          Founding early access (visible before Opens at)
        </label>
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
      {pending ? "Creating…" : "Create allocation"}
    </button>
  );
}
