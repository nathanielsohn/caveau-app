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

// Anything matching one of these substrings (case-insensitive) is redacted
// before the payload reaches stdout/Sentry. Defense in depth — the calling
// code shouldn't be passing these in the first place, but a single missed
// log statement shouldn't be the difference between safe and a leaked secret.
const REDACT_KEY_PATTERNS = [
  "password",
  "passwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "session",
];

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT_KEY_PATTERNS.some((p) => k.includes(p));
}

function redact(input: unknown, depth = 0): unknown {
  if (depth > 4 || input == null) return input;
  if (Array.isArray(input)) return input.map((v) => redact(v, depth + 1));
  if (typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function emit(level: Level, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const safeContext = context
    ? (redact(context) as LogContext)
    : undefined;

  const payload = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...safeContext,
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
    if (safeContext && Object.keys(safeContext).length > 0) {
      console.log(tag, message, safeContext);
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
  // Sentry is an optional peer dep. We hide the import from webpack's static
  // analyzer using a runtime-evaluated specifier so that builds succeed
  // whether or not @sentry/nextjs is installed. Set SENTRY_DSN and
  // `npm install @sentry/nextjs` to opt in.
  try {
    const moduleName = "@sentry/nextjs";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-new-func
    const dynamicImport = new Function("m", "return import(m)") as (
      m: string,
    ) => Promise<unknown>;
    const mod = (await dynamicImport(moduleName).catch(() => null)) as
      | {
          captureException: (e: unknown, opts: { extra: LogContext }) => void;
          captureMessage: (m: string, opts: { extra: LogContext }) => void;
        }
      | null;
    if (!mod) return;
    if (error instanceof Error) {
      mod.captureException(error, { extra: context });
    } else {
      mod.captureMessage(message, { extra: context });
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
