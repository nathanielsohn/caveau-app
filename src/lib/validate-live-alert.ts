import type { AlertType, Severity } from "@prisma/client";

const ALERT_TYPES = new Set<AlertType>([
  "temperature",
  "humidity",
  "vibration",
  "light",
  "door",
  "access",
]);
const SEVERITIES = new Set<Severity>(["info", "warning", "critical"]);

const MAX_MESSAGE_LENGTH = 500;

export interface LiveAlertInput {
  type: unknown;
  severity: unknown;
  message: unknown;
}

export interface ValidLiveAlert {
  type: AlertType;
  severity: Severity;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: ValidLiveAlert }
  | { ok: false; error: string };

export function validateLiveAlert(input: LiveAlertInput): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "invalid input" };
  }

  if (typeof input.type !== "string" || !ALERT_TYPES.has(input.type as AlertType)) {
    return { ok: false, error: "invalid type" };
  }
  if (
    typeof input.severity !== "string" ||
    !SEVERITIES.has(input.severity as Severity)
  ) {
    return { ok: false, error: "invalid severity" };
  }
  if (typeof input.message !== "string") {
    return { ok: false, error: "invalid message" };
  }
  if (input.message.length === 0) {
    return { ok: false, error: "empty message" };
  }

  return {
    ok: true,
    data: {
      type: input.type as AlertType,
      severity: input.severity as Severity,
      message: input.message.slice(0, MAX_MESSAGE_LENGTH),
    },
  };
}
