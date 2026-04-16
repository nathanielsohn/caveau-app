"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toggleHurricaneProtection } from "./actions";
import { showToast } from "@/components/toast";

interface EnrollmentFormProps {
  initialEnrolled: boolean;
}

export default function EnrollmentForm({ initialEnrolled }: EnrollmentFormProps) {
  const [enrolled, setEnrolled] = useState(initialEnrolled);
  const [isPending, startTransition] = useTransition();

  const submit = (nextEnrolled: boolean) => {
    const fd = new FormData();
    if (nextEnrolled) fd.set("enrolled", "on");
    startTransition(async () => {
      const result = await toggleHurricaneProtection(fd);
      if (result.ok) {
        setEnrolled(nextEnrolled);
        showToast(
          nextEnrolled
            ? "Enrolled in Hurricane Protection"
            : "Hurricane Protection disabled",
        );
      } else {
        showToast(result.error ?? "Could not update enrollment", "error");
      }
    });
  };

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-t border-[#2A2A30]/60">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-primary font-medium">
          {enrolled ? "Enrolled" : "Not enrolled"}
        </p>
        <p className="text-xs text-muted mt-0.5">
          {enrolled
            ? "We'll contact you directly when the NHC issues a watch for your region."
            : "Enroll to activate the protocol when a named storm threatens your area."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => submit(!enrolled)}
        disabled={isPending}
        aria-pressed={enrolled}
        className={`inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          enrolled
            ? "bg-[#1C1C20]/80 text-secondary border border-[#2A2A30] hover:text-primary"
            : "bg-gold text-caveau-black hover:bg-gold/90"
        }`}
      >
        {enrolled ? (
          <>
            <ShieldOff className="w-4 h-4" />
            {isPending ? "Updating…" : "Disable"}
          </>
        ) : (
          <>
            <ShieldCheck className="w-4 h-4" />
            {isPending ? "Enrolling…" : "Enroll"}
          </>
        )}
      </button>
    </div>
  );
}
