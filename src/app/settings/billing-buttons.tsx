"use client";

import { useState, useTransition } from "react";
import { showToast } from "@/components/toast";
import {
  createBillingPortalAction,
  createCheckoutSessionAction,
} from "./actions";

type PendingAction = "checkout" | "portal" | null;

export default function BillingButtons(props: {
  startDisabled: boolean;
  manageDisabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  function begin(action: Exclude<PendingAction, null>) {
    setPendingAction(action);
    startTransition(async () => {
      const res =
        action === "checkout"
          ? await createCheckoutSessionAction()
          : await createBillingPortalAction();
      if (!res.ok) {
        showToast(res.error, "error");
        setPendingAction(null);
        return;
      }
      window.location.assign(res.url);
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
      <button
        type="button"
        disabled={pending || props.startDisabled}
        onClick={() => begin("checkout")}
        className="btn-gold min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending && pendingAction === "checkout" ? "Redirecting…" : "Start membership"}
      </button>
      <button
        type="button"
        disabled={pending || props.manageDisabled}
        onClick={() => begin("portal")}
        className="btn-ghost min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending && pendingAction === "portal" ? "Opening…" : "Manage billing"}
      </button>
    </div>
  );
}

