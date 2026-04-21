"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AllocationRequestStatus, AllocationStatus } from "@prisma/client";
import {
  acceptRequest,
  declineRequest,
  fulfillRequest,
  INITIAL_ADMIN_ALLOCATION_STATE,
  type AdminAllocationFormState,
} from "../actions";

interface Props {
  requestId: string;
  status: AllocationRequestStatus;
  allocationStatus: AllocationStatus;
}

export default function AdminRequestActions({
  requestId,
  status,
  allocationStatus,
}: Props) {
  const [acceptState, acceptAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(acceptRequest, INITIAL_ADMIN_ALLOCATION_STATE);
  const [declineState, declineAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(declineRequest, INITIAL_ADMIN_ALLOCATION_STATE);
  const [fulfillState, fulfillAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(fulfillRequest, INITIAL_ADMIN_ALLOCATION_STATE);

  const errorMsg =
    acceptState.error ?? declineState.error ?? fulfillState.error ?? null;
  const okMsg =
    acceptState.message ?? declineState.message ?? fulfillState.message ?? null;

  const allocationOpen = allocationStatus === AllocationStatus.published;
  const canAccept = status === AllocationRequestStatus.submitted && allocationOpen;
  const canDecline =
    status === AllocationRequestStatus.submitted ||
    status === AllocationRequestStatus.accepted;
  const canFulfill = status === AllocationRequestStatus.accepted;

  if (!canAccept && !canDecline && !canFulfill) {
    return (
      <p className="text-xs text-muted">No further actions for this request.</p>
    );
  }

  return (
    <div className="space-y-3">
      {errorMsg && (
        <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {errorMsg}
        </div>
      )}
      {okMsg && !errorMsg && (
        <div className="px-3 py-2 rounded-lg bg-ok/10 border border-ok/20 text-ok text-xs">
          {okMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-start">
        {canAccept && (
          <form action={acceptAction} className="flex gap-2 items-start">
            <input type="hidden" name="requestId" value={requestId} />
            <input
              type="text"
              name="staffNote"
              placeholder="Note (optional)"
              maxLength={500}
              className="px-3 py-1.5 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-xs focus:outline-none focus:border-gold/50"
            />
            <SubmitButton pendingLabel="Accepting…" label="Accept" tone="gold" />
          </form>
        )}
        {canFulfill && (
          <form action={fulfillAction}>
            <input type="hidden" name="requestId" value={requestId} />
            <SubmitButton
              pendingLabel="Fulfilling…"
              label="Fulfill · add to collection"
              tone="gold"
            />
          </form>
        )}
        {canDecline && (
          <form action={declineAction} className="flex gap-2 items-start">
            <input type="hidden" name="requestId" value={requestId} />
            <input
              type="text"
              name="staffNote"
              placeholder="Reason (optional)"
              maxLength={500}
              className="px-3 py-1.5 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-xs focus:outline-none focus:border-gold/50"
            />
            <SubmitButton
              pendingLabel="Declining…"
              label="Decline"
              tone="ghost"
            />
          </form>
        )}
      </div>
    </div>
  );
}

function SubmitButton({
  pendingLabel,
  label,
  tone,
}: {
  pendingLabel: string;
  label: string;
  tone: "gold" | "ghost";
}) {
  const { pending } = useFormStatus();
  const cls =
    tone === "gold"
      ? "bg-gold text-caveau-black hover:bg-gold/90"
      : "border border-[#2A2A30] text-secondary hover:text-primary hover:border-danger/40";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${cls}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
