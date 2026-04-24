"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { Copy, XCircle } from "lucide-react";
import { INSURANCE_PARTNERS } from "@/lib/insurance";
import { showToast } from "@/components/toast";
import {
  cancelInsuranceReferral,
  INITIAL_INSURANCE_REFERRAL_REQUEST_STATE,
  submitInsuranceReferral,
  type InsuranceReferralRequestState,
} from "./actions";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="btn-gold min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {pending ? "Submitting…" : "Submit referral"}
    </button>
  );
}

function CopyButton({ value }: { value: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await navigator.clipboard.writeText(value);
            showToast("Copied reference token");
          } catch {
            showToast("Copy failed", "error");
          }
        })
      }
      className="btn-ghost min-h-[40px] px-3 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Copy className="w-4 h-4" />
      <span className="ml-2">{pending ? "Copying…" : "Copy"}</span>
    </button>
  );
}

export default function ReferralForm(props: {
  configured: boolean;
  openReferral:
    | { id: string; partnerName: string; status: string; shareToken: string }
    | null;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<
    InsuranceReferralRequestState,
    FormData
  >(submitInsuranceReferral, INITIAL_INSURANCE_REFERRAL_REQUEST_STATE);

  const [selectedPartner, setSelectedPartner] = useState<string>(() => {
    const first = INSURANCE_PARTNERS[0]?.name;
    return first ?? "";
  });

  const selectedFocus = useMemo(() => {
    return (
      INSURANCE_PARTNERS.find((p) => p.name === selectedPartner)?.focus ?? ""
    );
  }, [selectedPartner]);

  useEffect(() => {
    if (state.submittedAt === null) return;
    if (state.ok) {
      showToast("Referral submitted");
      router.refresh();
    } else if (state.error) {
      showToast(state.error, "error");
    }
  }, [state, router]);

  const disabled = !props.configured || Boolean(props.openReferral);

  if (!props.configured) {
    return (
      <div className="px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn">
        Insurance partner program is disabled in this environment. Configure{" "}
        <span className="font-mono">INSURANCE_PARTNER_ENABLED</span> and{" "}
        <span className="font-mono">INSURANCE_API_SECRET</span> to enable
        carrier referrals and proof-of-storage exports.
      </div>
    );
  }

  if (state.ok && state.shareToken) {
    return (
      <div className="p-5 rounded-2xl bg-ok/10 border border-ok/30">
        <p className="text-[10px] uppercase tracking-widest text-ok mb-1">
          Submitted
        </p>
        <p className="font-serif text-lg text-primary mb-2">
          Referral request received
        </p>
        <p className="text-sm text-secondary mb-4">
          Share this reference token with your agent or carrier. They can use
          it to pull Caveau proof-of-storage and signed Custody &amp;
          Condition Report exports.
        </p>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs text-muted mb-1">Carrier reference token</p>
            <p className="font-mono text-xs text-primary break-all">
              {state.shareToken}
            </p>
          </div>
          <CopyButton value={state.shareToken} />
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {props.openReferral && (
        <div className="px-4 py-3 rounded-xl border border-warn/30 bg-warn/10 text-xs text-warn flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-primary font-medium">
              Active referral request
            </p>
            <p className="text-xs text-secondary mt-1">
              {props.openReferral.partnerName} ·{" "}
              {props.openReferral.status.replace(/_/g, " ")}
            </p>
            <p className="text-[11px] text-muted mt-2">
              Carrier reference token:{" "}
              <span className="font-mono break-all">
                {props.openReferral.shareToken}
              </span>
            </p>
          </div>
          <CancelButton referralId={props.openReferral.id} />
        </div>
      )}

      {state.error && (
        <div className="px-4 py-3 rounded-xl border border-danger/30 bg-danger/10 text-xs text-danger">
          {state.error}
        </div>
      )}

      <div>
        <label
          htmlFor="partnerName"
          className="block text-sm text-primary font-medium mb-1"
        >
          Carrier partner
        </label>
        <p className="text-xs text-muted mb-3">
          Choose the carrier you want to apply the Caveau storage discount
          with.
        </p>
        <select
          id="partnerName"
          name="partnerName"
          value={selectedPartner}
          disabled={disabled}
          onChange={(e) => setSelectedPartner(e.target.value)}
          className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {INSURANCE_PARTNERS.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        {selectedFocus && (
          <p className="text-[11px] text-muted mt-2">{selectedFocus}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Agent name" name="contactName" disabled={disabled} />
        <Field
          label="Agent email"
          name="contactEmail"
          type="email"
          disabled={disabled}
        />
        <Field
          label="Agent phone"
          name="contactPhone"
          placeholder="Optional"
          disabled={disabled}
        />
        <Field
          label="Policy number"
          name="policyNumber"
          placeholder="Optional"
          disabled={disabled}
        />
      </div>

      <div>
        <label
          htmlFor="memberNote"
          className="block text-sm text-primary font-medium mb-1"
        >
          Note (optional)
        </label>
        <p className="text-xs text-muted mb-3">
          Anything your carrier wants confirmed (valuation basis, locations,
          timing).
        </p>
        <textarea
          id="memberNote"
          name="memberNote"
          rows={4}
          maxLength={1000}
          disabled={disabled}
          className="w-full px-4 py-3 rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
          placeholder="e.g. Please issue proof-of-storage for my Valuable Articles binder renewal this month."
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton disabled={disabled} />
      </div>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  disabled: boolean;
}) {
  const id = props.name;
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-primary font-medium mb-1">
        {props.label}
      </label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? "text"}
        maxLength={200}
        disabled={props.disabled}
        placeholder={props.placeholder ?? ""}
        className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0F0F11] border border-[#2A2A30] text-sm text-primary focus:border-gold/60 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function CancelButton({ referralId }: { referralId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelInsuranceReferral(referralId);
          if (!res.ok) {
            showToast("Unable to cancel referral", "error");
            return;
          }
          showToast("Referral cancelled");
          router.refresh();
        })
      }
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-warn/30 bg-warn/10 text-warn text-xs font-medium hover:bg-warn/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <XCircle className="w-4 h-4" />
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}

