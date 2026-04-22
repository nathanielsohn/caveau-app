"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AcquisitionSource } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import {
  fulfillAcquisition,
  INITIAL_ADMIN_ACQUISITION_STATE,
  type AdminAcquisitionFormState,
} from "../actions";
import {
  computeMargin,
  SOURCE_LABELS,
  TARGET_MARGIN_PCT_HIGH,
  TARGET_MARGIN_PCT_LOW,
} from "@/lib/acquisitions";

interface Props {
  acquisitionId: string;
  quantity: number;
  estimatedTotalUsd: number | null;
  maxBudgetUsd: number | null;
}

/**
 * Fulfill form — captures actual cost + member price + source, live-
 * computes margin, flags out-of-band margins, and warns if member
 * price exceeds the budget cap the member set.
 *
 * A dry-run margin preview is intentional: the 8–12% target band from
 * slide 15 is the operator's reporting handle, and showing staff the
 * margin live reduces the "oh, that was 6%" surprises in the CSV
 * export. Staff can still fulfill outside the band (the form doesn't
 * hard-block) — they just get a visible warning.
 */
export default function FulfillForm({
  acquisitionId,
  quantity,
  estimatedTotalUsd,
  maxBudgetUsd,
}: Props) {
  const [state, formAction] = useFormState<
    AdminAcquisitionFormState,
    FormData
  >(fulfillAcquisition, INITIAL_ADMIN_ACQUISITION_STATE);

  const [cost, setCost] = useState<string>("");
  const [price, setPrice] = useState<string>(
    estimatedTotalUsd != null ? String(estimatedTotalUsd) : "",
  );

  const costNum = Number(cost);
  const priceNum = Number(price);
  const marginPreview = useMemo(() => {
    if (!Number.isFinite(costNum) || !Number.isFinite(priceNum)) return null;
    if (costNum <= 0 || priceNum <= 0) return null;
    return computeMargin({ actualCostUsd: costNum, memberPriceUsd: priceNum });
  }, [costNum, priceNum]);

  const overBudget =
    maxBudgetUsd != null &&
    Number.isFinite(priceNum) &&
    priceNum > maxBudgetUsd;

  return (
    <div className="glass-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
        Fulfill
      </p>
      <p className="text-xs text-secondary mb-4">
        Locks in cost + member price, computes margin, and writes{" "}
        <span className="text-primary">{quantity}</span>{" "}
        {quantity === 1 ? "Wine row" : "Wine rows"} into the member&apos;s
        collection with a{" "}
        <span className="font-mono text-[11px]">sourceAcquisitionId</span>{" "}
        back-link.
      </p>

      {state.error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="acquisitionId" value={acquisitionId} />

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-muted mb-1">
              Our cost (USD)
            </span>
            <input
              name="actualCostUsd"
              type="number"
              min={0}
              step={0.01}
              required
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-muted mb-1">
              Member price (USD)
            </span>
            <input
              name="memberPriceUsd"
              type="number"
              min={0}
              step={0.01}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-xs text-muted mb-1">Source</span>
          <select
            name="source"
            required
            defaultValue={AcquisitionSource.broker}
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          >
            {(
              [
                AcquisitionSource.livex,
                AcquisitionSource.broker,
                AcquisitionSource.auction,
                AcquisitionSource.caveau_private,
              ] as const
            ).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="block text-xs text-muted mb-1">
            Closing note to member (optional)
          </span>
          <textarea
            name="staffNote"
            rows={2}
            maxLength={1000}
            placeholder="Bottle condition, provenance detail, ETA for locker intake."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
        </label>

        {/* Live margin preview */}
        {marginPreview && marginPreview.marginPct != null && (
          <div
            className={`px-3 py-2 rounded-lg border text-xs ${
              marginPreview.withinTargetBand
                ? "bg-ok/10 border-ok/30 text-ok"
                : "bg-gold/5 border-gold/30 text-gold"
            }`}
          >
            Preview · margin {marginPreview.marginUsd >= 0 ? "+" : ""}
            {marginPreview.marginUsd.toFixed(2)} USD ·{" "}
            {marginPreview.marginPct.toFixed(2)}%
            {!marginPreview.withinTargetBand && (
              <span className="block text-[11px] mt-1">
                Outside the {TARGET_MARGIN_PCT_LOW}–{TARGET_MARGIN_PCT_HIGH}%
                target band — you can still fulfill, but it&apos;ll be
                flagged in reporting.
              </span>
            )}
          </div>
        )}

        {overBudget && (
          <div className="px-3 py-2 rounded-lg border bg-danger/10 border-danger/30 text-danger text-xs flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Member price exceeds the budget cap
              {maxBudgetUsd != null && (
                <> ({`$${maxBudgetUsd.toLocaleString("en-US")}`})</>
              )}
              . Confirm with the member before fulfilling.
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
      {pending ? "Fulfilling…" : "Fulfill · add to member collection"}
    </button>
  );
}
