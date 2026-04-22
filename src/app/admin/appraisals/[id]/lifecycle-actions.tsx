"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, X, XCircle } from "lucide-react";
import { AppraisalStatus } from "@prisma/client";
import {
  cancelAppraisalAsAdmin,
  revokeAppraisal,
  startAppraisal,
} from "../actions";

interface Props {
  appraisalId: string;
  status: AppraisalStatus;
  canRevoke: boolean;
}

export default function AppraisalLifecycleActions({
  appraisalId,
  status,
  canRevoke,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    errLabel: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        router.refresh();
      } else {
        alert(`${errLabel} failed: ${res.error ?? "unknown"}`);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === AppraisalStatus.submitted && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => startAppraisal(appraisalId), "Start")}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {isPending ? "Starting…" : "Mark in progress"}
        </button>
      )}

      {(status === AppraisalStatus.submitted ||
        status === AppraisalStatus.in_progress) && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            const note = window.prompt("Staff note (optional)") ?? undefined;
            if (!window.confirm("Cancel this appraisal request?")) return;
            run(
              () => cancelAppraisalAsAdmin(appraisalId, note || undefined),
              "Cancel",
            );
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#2A2A30] text-muted text-sm hover:text-danger hover:border-danger/30 transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
          {isPending ? "Cancelling…" : "Cancel request"}
        </button>
      )}

      {canRevoke && (
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            const note =
              window.prompt(
                "Reason for revocation (required — written to staff note)",
              ) ?? "";
            if (!note.trim()) return;
            if (
              !window.confirm(
                "Revoke this completed appraisal? The document will be marked revoked and the public verify page will refuse to resolve its hash.",
              )
            )
              return;
            run(
              () => revokeAppraisal(appraisalId, note.trim()),
              "Revoke",
            );
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          {isPending ? "Revoking…" : "Revoke"}
        </button>
      )}
    </div>
  );
}
