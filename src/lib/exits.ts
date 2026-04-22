import { ExitChannel, ExitStatus, type ExitFacilitation } from "@prisma/client";

/**
 * Exit facilitation helpers (feature #47).
 *
 * Single source of truth for lifecycle transitions, commission math, and
 * label tables. The admin queue, member detail page, sale-close server
 * action, and AI Advisor `getMyExits` tool all route through this file
 * so the rules stay consistent — same pattern as `acquisitions.ts`.
 *
 * Workflow is the mirror of #62 acquisitions: #62 is staff sources a
 * bottle → writes Wine rows + 8–12% margin. #47 is staff consigns a
 * bottle → writes a WineDisposition row + 10–12% commission. Commission
 * math is the reverse of margin math: it's a cut *of* the sale price,
 * not a markup *on* the cost.
 */

// ── Commission target band ─────────────────────────────────────────────

/** Auction-house / broker commission floor. Slide 5 quotes "10–12%
 *  commission tracked"; slide 12 pitches the same range. Values below
 *  this (e.g. 5% broker flat) fulfill normally but get flagged in the
 *  admin CSV export so a pricing-drift row doesn't slip through
 *  silently. Zero is allowed specifically for self_handled channels. */
export const TARGET_COMMISSION_PCT_LOW = 10;
export const TARGET_COMMISSION_PCT_HIGH = 12;

// ── Lifecycle transitions ──────────────────────────────────────────────

/**
 * Legal next-statuses for an exit facilitation. Kept as an explicit
 * switch — the UI gates actions off this function so any change here is
 * a UI change too.
 *
 * Rules:
 *   - requested: staff lists (→ listed) or withdraws; member cancels
 *   - listed:    staff closes (→ sold) or withdraws. MEMBER CANNOT CANCEL.
 *   - sold / withdrawn / cancelled: terminal
 *
 * Rationale on no-member-cancel-once-listed: a listed lot at Sotheby's
 * or a placed broker consignment is contractually committed. Member
 * pressure to pull a live listing is staff-mediated and writes
 * `withdrawn` with a reason, not `cancelled`.
 */
export function canTransitionExit(
  from: ExitStatus,
  to: ExitStatus,
): boolean {
  switch (from) {
    case ExitStatus.requested:
      return (
        to === ExitStatus.listed ||
        to === ExitStatus.withdrawn ||
        to === ExitStatus.cancelled
      );
    case ExitStatus.listed:
      return to === ExitStatus.sold || to === ExitStatus.withdrawn;
    case ExitStatus.sold:
    case ExitStatus.withdrawn:
    case ExitStatus.cancelled:
      return false;
  }
}

/** Can the member still cancel their own request? Only valid pre-listing. */
export function isMemberCancellable(status: ExitStatus): boolean {
  return status === ExitStatus.requested;
}

/** Is the facilitation in a terminal state (no further action)? */
export function isTerminal(status: ExitStatus): boolean {
  return (
    status === ExitStatus.sold ||
    status === ExitStatus.withdrawn ||
    status === ExitStatus.cancelled
  );
}

// ── Commission math ────────────────────────────────────────────────────

export interface CommissionResult {
  commissionUsd: number;
  netProceedsUsd: number;
  withinTargetBand: boolean;
}

/**
 * Compute commission + net proceeds from gross proceeds and a
 * commission percent. Commission is taken *off* gross (mark-down on
 * sale price, not mark-up on cost — opposite convention from #62
 * margin math).
 *
 * `withinTargetBand` reports whether `commissionPct` is in
 * [TARGET_COMMISSION_PCT_LOW, TARGET_COMMISSION_PCT_HIGH]. Zero-commission
 * rows (self_handled) are trivially "not in band" but staff UI treats
 * them as OK via an upstream channel check — the band only applies
 * when Caveau is actually collecting a fee. Out-of-band non-zero rows
 * flag in the CSV export.
 */
export function computeCommission(input: {
  grossProceedsUsd: number;
  commissionPct: number;
}): CommissionResult {
  const { grossProceedsUsd, commissionPct } = input;
  const commissionUsd = Number(
    ((grossProceedsUsd * commissionPct) / 100).toFixed(2),
  );
  const netProceedsUsd = Number(
    (grossProceedsUsd - commissionUsd).toFixed(2),
  );
  const withinTargetBand =
    commissionPct >= TARGET_COMMISSION_PCT_LOW &&
    commissionPct <= TARGET_COMMISSION_PCT_HIGH;
  return { commissionUsd, netProceedsUsd, withinTargetBand };
}

/** Typical commission default per channel, used to pre-fill the close-sale
 *  form. Staff can override before committing. Auction/broker sit at the
 *  11% midpoint of the 10–12% target band. Private-sale is lower because
 *  there's no third-party marketplace fee to pass through. self_handled
 *  is zero by contract. */
export function defaultCommissionPct(channel: ExitChannel): number {
  switch (channel) {
    case ExitChannel.auction:
      return 11;
    case ExitChannel.broker:
      return 11;
    case ExitChannel.private_sale:
      return 8;
    case ExitChannel.self_handled:
      return 0;
  }
}

// ── Display tables ─────────────────────────────────────────────────────

export const STATUS_LABELS: Record<ExitStatus, string> = {
  [ExitStatus.requested]: "Requested",
  [ExitStatus.listed]: "Listed",
  [ExitStatus.sold]: "Sold",
  [ExitStatus.withdrawn]: "Withdrawn",
  [ExitStatus.cancelled]: "Cancelled",
};

/** Member-facing status copy — the admin labels are staff-voice. */
export const MEMBER_STATUS_COPY: Record<ExitStatus, string> = {
  [ExitStatus.requested]: "In review",
  [ExitStatus.listed]: "Listed",
  [ExitStatus.sold]: "Sold",
  [ExitStatus.withdrawn]: "Withdrawn",
  [ExitStatus.cancelled]: "Cancelled",
};

export const CHANNEL_LABELS: Record<ExitChannel, string> = {
  [ExitChannel.auction]: "Auction",
  [ExitChannel.broker]: "Broker",
  [ExitChannel.private_sale]: "Private sale",
  [ExitChannel.self_handled]: "Self-handled",
};

/** Member-facing channel explainer — one line on the detail page. */
export const CHANNEL_DESCRIPTION: Record<ExitChannel, string> = {
  [ExitChannel.auction]:
    "Consigned to a named auction house — Christie's, Sotheby's, Zachys, Acker, or similar.",
  [ExitChannel.broker]:
    "Placed with a fine-wine broker in Caveau's partner network.",
  [ExitChannel.private_sale]:
    "Direct match to a private collector, sale handled by Caveau.",
  [ExitChannel.self_handled]:
    "You receive the CCR + provenance bundle and handle the sale yourself. No commission.",
};

// ── Spec helpers ───────────────────────────────────────────────────────

export type ExitWineSummary = Pick<
  ExitFacilitation,
  "channel" | "auctionHouseName"
>;

/**
 * Human-readable one-line channel summary for the member UI. If the
 * channel is auction and a house name is set, returns "Auction ·
 * Sotheby's"; otherwise the plain channel label.
 */
export function formatChannelWithHouse(input: ExitWineSummary): string {
  if (!input.channel) return "—";
  const label = CHANNEL_LABELS[input.channel];
  if (input.channel === ExitChannel.auction && input.auctionHouseName) {
    return `${label} · ${input.auctionHouseName}`;
  }
  return label;
}

/** Common auction-house names surfaced as suggestions in the admin
 *  list form. Free text is still persisted so Rob can add houses
 *  without a migration — this is just the typeahead. */
export const KNOWN_AUCTION_HOUSES: readonly string[] = [
  "Christie's",
  "Sotheby's",
  "Zachys",
  "Acker",
  "Hart Davis Hart",
];
