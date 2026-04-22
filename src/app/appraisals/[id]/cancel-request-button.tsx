"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cancelAppraisalRequest } from "../actions";

export default function CancelRequestButton({
  appraisalId,
}: {
  appraisalId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (
          !confirm(
            "Cancel this appraisal request? You can submit a new one any time.",
          )
        ) {
          return;
        }
        startTransition(async () => {
          const res = await cancelAppraisalRequest(appraisalId);
          if (res.ok) {
            router.refresh();
          } else {
            alert("Unable to cancel this request.");
          }
        });
      }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-muted text-sm hover:text-danger hover:border-danger/30 transition-colors disabled:opacity-50"
    >
      <X className="w-4 h-4" />
      {isPending ? "Cancelling…" : "Cancel request"}
    </button>
  );
}
