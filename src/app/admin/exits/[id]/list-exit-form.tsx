"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { ExitChannel } from "@prisma/client";
import {
  listExit,
  INITIAL_ADMIN_EXIT_STATE,
  type AdminExitFormState,
} from "../actions";
import {
  CHANNEL_LABELS,
  CHANNEL_DESCRIPTION,
  KNOWN_AUCTION_HOUSES,
} from "@/lib/exits";

interface Props {
  exitId: string;
  preferredChannel: ExitChannel | null;
  currentValueUsd: number;
  targetPriceLow: number | null;
  targetPriceHigh: number | null;
}

const CHANNELS: readonly ExitChannel[] = [
  ExitChannel.auction,
  ExitChannel.broker,
  ExitChannel.private_sale,
  ExitChannel.self_handled,
];

/**
 * List form — staff picks channel + auction house (if applicable) +
 * listed price and flips the exit to `listed`. Pre-fills channel from
 * the member's preference (non-binding hint) and listed price from the
 * midpoint of the target range / current value as a sensible default.
 */
export default function ListExitForm({
  exitId,
  preferredChannel,
  currentValueUsd,
  targetPriceLow,
  targetPriceHigh,
}: Props) {
  const [state, formAction] = useFormState<AdminExitFormState, FormData>(
    listExit,
    INITIAL_ADMIN_EXIT_STATE,
  );

  const [channel, setChannel] = useState<ExitChannel>(
    preferredChannel ?? ExitChannel.auction,
  );

  // Default listed price — midpoint of target range if set, else the
  // wine's current value rounded up to the nearest $10.
  const defaultListed = (() => {
    if (targetPriceLow != null && targetPriceHigh != null) {
      return Math.round((targetPriceLow + targetPriceHigh) / 2);
    }
    if (targetPriceLow != null) return Math.round(targetPriceLow);
    if (targetPriceHigh != null) return Math.round(targetPriceHigh);
    return Math.round(currentValueUsd / 10) * 10;
  })();

  return (
    <div className="glass-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-gold-text mb-3">
        List on a channel
      </p>
      <p className="text-xs text-secondary mb-4">
        Picks the consignment route + listed price and flips the exit to{" "}
        <span className="text-primary">listed</span>. Once listed, only
        staff can close the sale or withdraw.
      </p>

      {state.error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="exitId" value={exitId} />

        <label className="block">
          <span className="block text-xs text-muted mb-1">Channel</span>
          <select
            name="channel"
            required
            value={channel}
            onChange={(e) => setChannel(e.target.value as ExitChannel)}
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
          <span className="block text-[11px] text-muted mt-1 leading-relaxed">
            {CHANNEL_DESCRIPTION[channel]}
          </span>
        </label>

        {channel === ExitChannel.auction && (
          <label className="block">
            <span className="block text-xs text-muted mb-1">
              Auction house
            </span>
            <input
              name="auctionHouseName"
              type="text"
              list="auction-house-suggestions"
              required
              maxLength={200}
              placeholder="e.g. Sotheby's"
              className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
            />
            <datalist id="auction-house-suggestions">
              {KNOWN_AUCTION_HOUSES.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </label>
        )}

        <label className="block">
          <span className="block text-xs text-muted mb-1">
            Listed price (USD)
          </span>
          <input
            name="listedPriceUsd"
            type="number"
            min={0}
            step={10}
            required
            defaultValue={defaultListed}
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
          {targetPriceLow != null && targetPriceHigh != null && (
            <span className="block text-[11px] text-muted mt-1">
              Member target: ${targetPriceLow.toLocaleString("en-US")}–$
              {targetPriceHigh.toLocaleString("en-US")}
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs text-muted mb-1">
            Listing note (optional, visible to member)
          </span>
          <textarea
            name="staffNote"
            rows={2}
            maxLength={1000}
            placeholder="e.g. Sotheby's Sept Fine & Rare sale, lot 247."
            className="w-full px-3 py-2 rounded-lg bg-[#1C1C20] border border-[#2A2A30]/50 text-primary text-sm focus:outline-none focus:border-gold/50"
          />
        </label>

        <GoldSubmit label="List on channel" pendingLabel="Listing…" />
      </form>
    </div>
  );
}

function GoldSubmit({
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
