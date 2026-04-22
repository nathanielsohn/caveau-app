"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { ExitChannel } from "@prisma/client";
import {
  sellExit,
  INITIAL_ADMIN_EXIT_STATE,
  type AdminExitFormState,
} from "../actions";
import {
  computeCommission,
  defaultCommissionPct,
  TARGET_COMMISSION_PCT_HIGH,
  TARGET_COMMISSION_PCT_LOW,
} from "@/lib/exits";

interface Props {
  exitId: string;
  channel: ExitChannel;
  listedPriceUsd: number | null;
}

/**
 * Close-sale form. Captures gross proceeds + commission percent;
 * submitting runs the transactional close (WineDisposition write +
 * Wine.status=sold + ExitSignal close + facilitation stamp) server-side.
 *
 * Live commission preview mirrors the #62 fulfillment form's margin
 * preview pattern — staff sees net proceeds before committing so a
 * fat-fingered 20% commission is caught before the transaction runs.
 * self_handled defaults commission to 0 and warns on anything > 0.
 */
export default function SellExitForm({
  exitId,
  channel,
  listedPriceUsd,
}: Props) {
  const [state, formAction] = useFormState<AdminExitFormState, FormData>(
    sellExit,
    INITIAL_ADMIN_EXIT_STATE,
  );

  const [gross, setGross] = useState<string>(
    listedPriceUsd != null ? String(listedPriceUsd) : "",
  );
  const [pct, setPct] = useState<string>(
    String(defaultCommissionPct(channel)),
  );

  const grossNum = Number(gross);
  const pctNum = Number(pct);
  const preview = useMemo(() => {
    if (!Number.isFinite(grossNum) || grossNum <= 0) return null;
    if (!Number.isFinite(pctNum) || pctNum < 0) return null;
    return computeCommission({
      grossProceedsUsd: grossNum,
      commissionPct: pctNum,
    });
  }, [grossNum, pctNum]);

  const isSelfHandled = channel === ExitChannel.self_handled;
  const commissionOnSelfHandled = isSelfHandled && pctNum > 0;

  return (
    <div className="glass-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
        Close the sale
      </p>
      <p className="text-xs text-secondary mb-4">
        Transactionally writes a <span className="text-primary">sold</span>{" "}
        disposition, flips the wine to sold, and closes the open exit
        signal. This cannot be undone from the UI.
      </p>

      {state.error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="exitId" value={exitId} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-muted mb-1">
              Gross proceeds (USD)
            </span>
            <input
              name="grossProceedsUsd"
              type="number"
              min={0}
              step={0.01}
              required
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted mb-1">
              Commission (%)
            </span>
            <input
              name="commissionPct"
              type="number"
              min={0}
              max={50}
              step={0.1}
              required
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs text-muted mb-1">
            Closing note (optional, visible to member)
          </span>
          <textarea
            name="staffNote"
            rows={2}
            maxLength={1000}
            placeholder="e.g. Lot 247 closed at hammer + 22% buyer's premium. Funds settle in 30 days."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
        </label>

        {preview && (
          <div
            className={`px-3 py-2 rounded-lg border text-xs ${
              preview.withinTargetBand || pctNum === 0
                ? "bg-ok/10 border-ok/30 text-ok"
                : "bg-gold/5 border-gold/30 text-gold"
            }`}
          >
            Preview · commission ${preview.commissionUsd.toFixed(2)}, net ${" "}
            {preview.netProceedsUsd.toFixed(2)}
            {pctNum !== 0 && !preview.withinTargetBand && (
              <span className="block text-[11px] mt-1">
                Outside the {TARGET_COMMISSION_PCT_LOW}–
                {TARGET_COMMISSION_PCT_HIGH}% target band — flagged in
                reporting.
              </span>
            )}
          </div>
        )}

        {commissionOnSelfHandled && (
          <div className="px-3 py-2 rounded-lg border bg-danger/10 border-danger/30 text-danger text-xs flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Self-handled channel should carry zero commission — Caveau
              doesn&apos;t touch the funds. Set to 0 or re-list on a
              concierge channel first.
            </span>
          </div>
        )}

        <Submit />
      </form>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 rounded-xl bg-gold text-caveau-black text-xs font-semibold hover:bg-gold/90 disabled:opacity-50 transition-colors"
    >
      {pending ? "Closing…" : "Close sale · commit transaction"}
    </button>
  );
}
