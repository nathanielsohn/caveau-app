/**
 * Reject anything that isn't a same-origin path.
 *
 * Used by both src/middleware.ts and src/app/auth/login/page.tsx so the open-
 * redirect guard is identical on the server-side redirect and the client-side
 * post-login navigation. Returning `null` lets the caller decide what to fall
 * back to (middleware drops the param; the login page substitutes "/").
 */
export function safeCallback(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("//")) return null;
  if (!raw.startsWith("/")) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("//") || decoded.includes("://")) return null;
  } catch {
    return null;
  }
  return raw;
}
