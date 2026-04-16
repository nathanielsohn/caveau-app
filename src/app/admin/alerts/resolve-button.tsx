"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { resolveAlertAction } from "./actions";
import { showToast } from "@/components/toast";

export default function ResolveButton({ alertId }: { alertId: string }) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const res = await resolveAlertAction(alertId);
      if (res.ok) {
        showToast("Alert resolved");
      } else {
        showToast(res.error || "Unable to resolve alert", "error");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label="Mark alert as resolved"
      className="inline-flex items-center gap-1.5 text-xs text-gold hover:text-gold-text disabled:opacity-50 transition-colors min-h-[32px] px-2"
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Check className="w-3.5 h-3.5" />
      )}
      Resolve
    </button>
  );
}
