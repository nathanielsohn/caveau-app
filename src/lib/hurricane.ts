import type { HurricaneStage } from "@prisma/client";

export const STAGE_LABELS: Record<HurricaneStage, string> = {
  watch_issued: "Watch issued",
  transport_dispatched: "Transport dispatched",
  sheltered: "Sheltered at vault",
  all_clear: "All clear",
  returned: "Returned to members",
  cancelled: "Cancelled",
};

// Short label used in the member-facing dashboard banner. Softer phrasing
// than the staff console — "your collection is sheltered" reads better than
// "sheltered at vault" in first-person context.
export const MEMBER_STAGE_LABELS: Record<HurricaneStage, string> = {
  watch_issued: "Protocol armed",
  transport_dispatched: "Transport en route",
  sheltered: "Your collection is sheltered",
  all_clear: "All clear — return imminent",
  returned: "Returned to your cellar",
  cancelled: "Protocol stood down",
};

// Stage progression: watch → dispatched → sheltered → all_clear → returned.
// `cancelled` is a terminal sidetrack from any pre-shelter stage.
export const STAGE_ORDER: HurricaneStage[] = [
  "watch_issued",
  "transport_dispatched",
  "sheltered",
  "all_clear",
  "returned",
];

export function isActiveStage(stage: HurricaneStage): boolean {
  return stage !== "returned" && stage !== "cancelled";
}

// Decide the next stage in the linear walk. Returns null if the protocol
// is at a terminal stage. Staff can still force-set any stage from the
// admin console — this is just the "advance" button's default.
export function nextStage(stage: HurricaneStage): HurricaneStage | null {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx === -1 || idx === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[idx + 1] ?? null;
}
