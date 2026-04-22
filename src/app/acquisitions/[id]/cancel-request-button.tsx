"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cancelAcquisitionRequest } from "../actions";

export default function CancelRequestButton({
  acquisitionId,
}: {
  acquisitionId: string;
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
            "Cancel this sourcing request? You can submit a new one any time.",
          )
        ) {
          return;
        }
        startTransition(async () => {
          const res = await cancelAcquisitionRequest(acquisitionId);
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
