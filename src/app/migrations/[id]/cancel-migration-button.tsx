"use client";

import { useFormState, useFormStatus } from "react-dom";
import { X } from "lucide-react";
import {
  cancelMigration,
  INITIAL_MIGRATION_FORM_STATE,
} from "../actions";

export default function CancelMigrationButton({ id }: { id: string }) {
  const [state, formAction] = useFormState(
    cancelMigration,
    INITIAL_MIGRATION_FORM_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <CancelSubmit />
      {state.error && (
        <p className="text-[11px] text-danger text-right">{state.error}</p>
      )}
    </form>
  );
}

function CancelSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-sm hover:border-danger/40 hover:text-danger disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <X className="w-4 h-4" />
      {pending ? "Cancelling…" : "Cancel migration"}
    </button>
  );
}
