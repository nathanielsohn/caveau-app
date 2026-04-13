/**
 * Reject anything that isn't a same-origin path.
 *
 * Used by both src/middleware.ts and src/app/auth/login/page.tsx so the open-
 * redirect guard is identical on the server-side redirect and the client-side
 * post-login navigation. Returning `null` lets the caller decide what to fall
 * back to (middleware drops the param; the login page substitutes "/").
 *
 * Hardening notes:
 *   - Reject any URL-encoded protocol-relative or absolute URL (`//foo`,
 *     `https://foo`).
 *   - Reject `data:` and `javascript:` schemes outright. They never start
 *     with `/`, so the leading-slash check already filters them, but we
 *     also block their URL-encoded forms (`%2F%2F`, `%2A`, etc.) by
 *     re-decoding and re-checking.
 *   - Reject backslash-prefixed paths (`\/foo`) — IE/Edge legacy parses
 *     these as protocol-relative.
 */
export function safeCallback(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  if (raw.length > 2048) return null;

  // Block protocol-relative, backslash, and non-root inputs upfront.
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("\\")) return null;
  if (!raw.startsWith("/")) return null;

  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("//")) return null;
    // Reject any backslash anywhere — legitimate URL paths never contain
    // them, and browsers like Chrome/Edge normalize `/\foo` into `//foo`.
    if (decoded.includes("\\")) return null;
    if (decoded.includes("://")) return null;
    // Defense in depth: reject anything that smells like a non-http scheme.
    const lower = decoded.toLowerCase().trimStart();
    if (lower.startsWith("javascript:")) return null;
    if (lower.startsWith("data:")) return null;
    if (lower.startsWith("vbscript:")) return null;
  } catch {
    return null;
  }

  return raw;
}
