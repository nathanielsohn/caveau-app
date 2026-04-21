"use client";

import { useFormState, useFormStatus } from "react-dom";
import { AllocationStatus } from "@prisma/client";
import {
  closeAllocation,
  publishAllocation,
  INITIAL_ADMIN_ALLOCATION_STATE,
  type AdminAllocationFormState,
} from "../actions";

interface Props {
  allocationId: string;
  status: AllocationStatus;
}

export default function AllocationLifecycleActions({
  allocationId,
  status,
}: Props) {
  const [publishState, publishAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(publishAllocation, INITIAL_ADMIN_ALLOCATION_STATE);
  const [closeState, closeAction] = useFormState<
    AdminAllocationFormState,
    FormData
  >(closeAllocation, INITIAL_ADMIN_ALLOCATION_STATE);

  const err = publishState.error ?? closeState.error ?? null;
  const ok = publishState.message ?? closeState.message ?? null;

  if (status === AllocationStatus.draft) {
    return (
      <div className="flex flex-col gap-2 items-end">
        <form action={publishAction}>
          <input type="hidden" name="allocationId" value={allocationId} />
          <Submit label="Publish" pendingLabel="Publishing…" />
        </form>
        {err && <p className="text-xs text-danger">{err}</p>}
        {ok && !err && <p className="text-xs text-ok">{ok}</p>}
      </div>
    );
  }

  if (status === AllocationStatus.published) {
    return (
      <div className="flex flex-col gap-2 items-end">
        <form action={closeAction}>
          <input type="hidden" name="allocationId" value={allocationId} />
          <SubmitGhost label="Close requests" pendingLabel="Closing…" />
        </form>
        {err && <p className="text-xs text-danger">{err}</p>}
        {ok && !err && <p className="text-xs text-ok">{ok}</p>}
      </div>
    );
  }

  return null;
}

function Submit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl bg-gold text-caveau-black text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function SubmitGhost({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl border border-[#2A2A30] text-secondary text-xs hover:text-primary hover:border-danger/40 disabled:opacity-50 transition-colors"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
