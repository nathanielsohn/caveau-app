/**
 * Structured logger.
 *
 * Single sink with JSON output in production and pretty output in dev. The
 * `error` method also forwards to Sentry when SENTRY_DSN is configured;
 * everything else stays in stdout/stderr where Vercel's log drains can pick
 * it up.
 *
 * Don't reach for `console.log` directly anywhere in src/ — every log line
 * should carry a level, a message, and a context object so it's filterable.
 */

import { env } from "./env";

type Level = "debug" | "info" | "warn" | "error";

export interface LogContext {
  // Common fields. Add any others ad hoc; the type is intentionally open.
  requestId?: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: Level = env.NODE_ENV === "production" ? "info" : "debug";

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

function emit(level: Level, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const payload = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...context,
  };

  if (env.NODE_ENV === "production") {
    // Vercel/CloudWatch ingest JSON-per-line cleanly.
    const line = JSON.stringify(payload);
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  } else {
    // Dev: keep it readable.
    const tag = `[${level.toUpperCase()}]`;
    if (context && Object.keys(context).length > 0) {
      console.log(tag, message, context);
    } else {
      console.log(tag, message);
    }
  }
}

function captureError(message: string, error: unknown, context?: LogContext): void {
  const errCtx: LogContext = {
    ...context,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorName: error instanceof Error ? error.name : undefined,
    // Stack only in dev — production logs go through structured ingest and
    // we'd rather route stacks via Sentry than dump them into stdout.
    ...(env.NODE_ENV !== "production" && error instanceof Error
      ? { stack: error.stack }
      : {}),
  };
  emit("error", message, errCtx);

  // Sentry is fire-and-forget; never let it block a request.
  if (env.SENTRY_DSN) {
    void forwardToSentry(message, error, errCtx);
  }
}

async function forwardToSentry(
  message: string,
  error: unknown,
  context: LogContext,
): Promise<void> {
  // Lazy import keeps Sentry out of the bundle when DSN isn't set. The SDK is
  // optional — if it's not installed, this just no-ops.
  try {
    // @ts-expect-error - optional peer dep
    const Sentry = await import("@sentry/nextjs").catch(() => null);
    if (!Sentry) return;
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: context });
    } else {
      Sentry.captureMessage(message, { extra: context });
    }
  } catch {
    // Swallow — logging the logger's failure would loop.
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, error: unknown, context?: LogContext) =>
    captureError(message, error, context),
};
