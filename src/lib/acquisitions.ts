import {
  AcquisitionSource,
  AcquisitionStatus,
  type Acquisition,
} from "@prisma/client";

/**
 * Acquisition sourcing helpers (feature #62).
 *
 * Single source of truth for status transitions, margin math, and
 * request-spec formatting. The admin queue, fulfill action, member
 * detail page, and advisor tool all route through this file so the
 * rules stay consistent — same pattern as `allocations.ts` and
 * `appraisals.ts`.
 */

/** Hard upper bound per request — keeps a single member from tying up
 *  staff on a 144-bottle concierge order that really belongs on the
 *  #27 bulk-purchase surface once it exists. 12 bottles covers a case,
 *  which is the largest typical ask. */
export const MAX_BOTTLES_PER_REQUEST = 12;

/** Target margin band surfaced to staff on the fulfill form and in the
 *  CSV export. Pulled from slide 15: "8–12% margin tracked". Staff can
 *  fulfill outside the band (the form doesn't hard-block) but the
 *  admin UI flags out-of-band rows so a $50 margin on a $5K bottle
 *  doesn't slip by silently. */
export const TARGET_MARGIN_PCT_LOW = 8;
export const TARGET_MARGIN_PCT_HIGH = 12;

// ── Lifecycle transitions ──────────────────────────────────────────────

/**
 * Legal next-statuses for an acquisition. Keeping this as an explicit
 * table (not a general DAG) because the UI gates actions off this
 * function — any change here is a UI change too.
 *
 * Rules:
 *   - requested: staff accepts (→ sourcing) or declines; member cancels
 *   - sourcing: staff fulfills or declines; member cancels
 *   - fulfilled / declined / cancelled: terminal
 *
 * The member-accept step that normally sits between `sourcing` and
 * `fulfilled` is skipped for the demo — see migration 0038 comment for
 * why. When Stripe (#27) lands, add a `quoted` state between
 * `sourcing` and `fulfilled` and gate `quoted → accepted → fulfilled`
 * behind member action.
 */
export function canTransitionAcquisition(
  from: AcquisitionStatus,
  to: AcquisitionStatus,
): boolean {
  switch (from) {
    case AcquisitionStatus.requested:
      return (
        to === AcquisitionStatus.sourcing ||
        to === AcquisitionStatus.declined ||
        to === AcquisitionStatus.cancelled
      );
    case AcquisitionStatus.sourcing:
      return (
        to === AcquisitionStatus.fulfilled ||
        to === AcquisitionStatus.declined ||
        to === AcquisitionStatus.cancelled
      );
    case AcquisitionStatus.fulfilled:
    case AcquisitionStatus.declined:
    case AcquisitionStatus.cancelled:
      return false;
  }
}

/** Can the member still cancel their own request? */
export function isMemberCancellable(status: AcquisitionStatus): boolean {
  return (
    status === AcquisitionStatus.requested ||
    status === AcquisitionStatus.sourcing
  );
}

// ── Margin math ────────────────────────────────────────────────────────

export interface MarginResult {
  marginUsd: number;
  marginPct: number | null;
  withinTargetBand: boolean;
}

/**
 * Compute margin in dollars + percent from cost and member price.
 *
 * `marginPct` is computed off `memberPrice` (mark-up pricing, not
 * mark-on-cost) so the 8–12% target band in slide 15 is read the same
 * way a retail operator would read it: "of what we charged the member,
 * what percent was our cut". A $920 quote on a $800 cost is
 * (920 − 800) / 920 = 13.04% margin by this convention.
 *
 * `withinTargetBand` reports whether `marginPct` is in
 * [TARGET_MARGIN_PCT_LOW, TARGET_MARGIN_PCT_HIGH]. Staff UI flags
 * anything outside (including negative) so the CSV export line item
 * reads cleanly. Null `marginPct` (zero member price) never counts as
 * in-band.
 */
export function computeMargin(input: {
  actualCostUsd: number;
  memberPriceUsd: number;
}): MarginResult {
  const { actualCostUsd, memberPriceUsd } = input;
  const marginUsd = Number((memberPriceUsd - actualCostUsd).toFixed(2));
  const marginPct =
    memberPriceUsd > 0
      ? Number(((marginUsd / memberPriceUsd) * 100).toFixed(2))
      : null;
  const withinTargetBand =
    marginPct !== null &&
    marginPct >= TARGET_MARGIN_PCT_LOW &&
    marginPct <= TARGET_MARGIN_PCT_HIGH;
  return { marginUsd, marginPct, withinTargetBand };
}

// ── Spec formatting ────────────────────────────────────────────────────

export type AcquisitionSpecFields = Pick<
  Acquisition,
  | "producer"
  | "wineName"
  | "vintageExact"
  | "vintageMin"
  | "vintageMax"
  | "region"
  | "varietal"
  | "quantity"
>;

/**
 * Human-readable one-line summary of the requested bottle. Handles the
 * three vintage shapes (exact / range / any) and trims optional fields
 * that weren't filled in so the UI never renders stray separators.
 *
 * Examples:
 *   "2010 Château Lafite Rothschild — Pauillac × 1"
 *   "2015–2018 Any Opus One × 3"
 *   "Any vintage · Châteauneuf-du-Pape × 6"
 */
export function formatAcquisitionSpec(a: AcquisitionSpecFields): string {
  const vintage = formatVintage(a);
  const head = a.wineName
    ? `${a.producer} ${a.wineName}`
    : a.producer;
  const parts: string[] = [];
  if (vintage) parts.push(vintage);
  parts.push(head);
  const tail: string[] = [];
  if (a.region) tail.push(a.region);
  if (a.varietal) tail.push(a.varietal);
  const base = tail.length > 0
    ? `${parts.join(" ")} — ${tail.join(" · ")}`
    : parts.join(" ");
  return `${base} × ${a.quantity}`;
}

export function formatVintage(a: {
  vintageExact: number | null;
  vintageMin: number | null;
  vintageMax: number | null;
}): string {
  if (a.vintageExact != null) return String(a.vintageExact);
  if (a.vintageMin != null && a.vintageMax != null) {
    if (a.vintageMin === a.vintageMax) return String(a.vintageMin);
    return `${a.vintageMin}–${a.vintageMax}`;
  }
  if (a.vintageMin != null) return `${a.vintageMin}+`;
  if (a.vintageMax != null) return `≤${a.vintageMax}`;
  return "";
}

// ── Display tables ─────────────────────────────────────────────────────

export const STATUS_LABELS: Record<AcquisitionStatus, string> = {
  [AcquisitionStatus.requested]: "Requested",
  [AcquisitionStatus.sourcing]: "Sourcing",
  [AcquisitionStatus.fulfilled]: "Fulfilled",
  [AcquisitionStatus.declined]: "Declined",
  [AcquisitionStatus.cancelled]: "Cancelled",
};

export const SOURCE_LABELS: Record<AcquisitionSource, string> = {
  [AcquisitionSource.livex]: "Liv-ex",
  [AcquisitionSource.broker]: "Broker",
  [AcquisitionSource.auction]: "Auction",
  [AcquisitionSource.caveau_private]: "Caveau private network",
};

/** Member-facing status copy — the admin labels are staff-voice. */
export const MEMBER_STATUS_COPY: Record<AcquisitionStatus, string> = {
  [AcquisitionStatus.requested]: "In review",
  [AcquisitionStatus.sourcing]: "Sourcing in progress",
  [AcquisitionStatus.fulfilled]: "Fulfilled",
  [AcquisitionStatus.declined]: "Declined",
  [AcquisitionStatus.cancelled]: "Cancelled",
};
