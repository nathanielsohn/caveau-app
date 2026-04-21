"use client";

import { useFormState, useFormStatus } from "react-dom";
import {
  cancelAllocationRequest,
  INITIAL_ALLOCATION_REQUEST_STATE,
  type AllocationRequestState,
} from "../actions";

interface Props {
  requestId: string;
  // Unused today — kept in the API so a future wrapper can read allocation
  // context from the client without another server round-trip.
  allocationId: string;
}

export default function CancelRequestButton({ requestId }: Props) {
  const [state, formAction] = useFormState<AllocationRequestState, FormData>(
    cancelAllocationRequest,
    INITIAL_ALLOCATION_REQUEST_STATE,
  );

  return (
    <form action={formAction} className="max-w-xs">
      <input type="hidden" name="requestId" value={requestId} />
      {state.error && (
        <p className="text-xs text-danger mb-2">{state.error}</p>
      )}
      <CancelButton />
    </form>
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
      {pending ? "Cancelling…" : "Cancel my request"}
    </button>
  );
}
