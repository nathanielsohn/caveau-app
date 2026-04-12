import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, type RateLimitPolicy } from "@/lib/rate-limit";

/* ------------------------------------------------------------------ */
/*  Per-route rate-limit policies                                      */
/* ------------------------------------------------------------------ */
//
// Tighter limits on auth and verification endpoints, looser limits on
// expensive read endpoints. Anything not matched here is unlimited at the
// middleware layer (the API route itself can still apply its own check).

const POLICIES: Array<{
  match: (req: NextRequest) => boolean;
  bucket: string;
  policy: RateLimitPolicy;
}> = [
  {
    bucket: "auth-signup",
    match: (req) =>
      req.method === "POST" && req.nextUrl.pathname === "/api/auth/signup",
    policy: { limit: 5, windowMs: 60_000 },
  },
  {
    bucket: "auth-login",
    match: (req) =>
      req.method === "POST" &&
      req.nextUrl.pathname.startsWith("/api/auth/callback"),
    policy: { limit: 10, windowMs: 60_000 },
  },
  {
    bucket: "verify",
    // Public certificate verification — primary attack surface for hash
    // enumeration. Tight per-IP cap; legitimate scans never come close.
    match: (req) => req.nextUrl.pathname.startsWith("/verify/"),
    policy: { limit: 20, windowMs: 60_000 },
  },
  {
    bucket: "sensors-history",
    // Bulk historical reads — expensive enough that we don't want even an
    // authenticated client running them in a hot loop.
    match: (req) =>
      req.method === "GET" &&
      req.nextUrl.pathname === "/api/sensors/history",
    policy: { limit: 30, windowMs: 60_000 },
  },
];

/* ------------------------------------------------------------------ */
/*  Content-Security-Policy builder                                   */
/* ------------------------------------------------------------------ */
function buildCsp(): string {
  const isDev = process.env.NODE_ENV === "development";

  // Next.js App Router injects inline scripts that can't carry nonces
  // without custom Document wiring. Use 'unsafe-inline' + 'self' which
  // is still a meaningful restriction (blocks external script injection).
  // TODO: migrate to a nonce-based policy via next.config + middleware.
  const scriptSrc = isDev
    ? `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");
}

/* ------------------------------------------------------------------ */
/*  callbackUrl sanitizer                                             */
/* ------------------------------------------------------------------ */
//
// Reject anything that isn't a same-origin path. Both `//evil.com` and
// `https://evil.com` are absolute and would otherwise propagate through
// /auth/login as an open redirect.
function safeCallback(raw: string | null): string | null {
  if (!raw) return null;
  try {
    if (raw.startsWith("//")) return null;
    if (!raw.startsWith("/")) return null;
    // Reject paths that decode into something that escapes the origin.
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("//") || decoded.includes("://")) return null;
    return raw;
  } catch {
    return null;
  }
}

function tooManyRequestsResponse(resetAt: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
      },
    },
  );
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                         */
/* ------------------------------------------------------------------ */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const csp = buildCsp();

  // --- Rate limit policy match (checked before auth so unauth scrapers count) ---
  for (const entry of POLICIES) {
    if (entry.match(req)) {
      const ip = clientIp(req.headers);
      const result = await checkRateLimit(`${entry.bucket}:${ip}`, entry.policy);
      if (!result.allowed) return tooManyRequestsResponse(result.resetAt);
      break;
    }
  }

  // --- Public paths — no auth required ---
  // /verify/[hash] is intentionally public (third-party provenance check).
  // /certificate/[id] is auth-protected; the page enforces ownership.
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health";

  if (isPublic) {
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  // --- Protected paths — require auth ---
  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    const validated = safeCallback(pathname);
    if (validated) loginUrl.searchParams.set("callbackUrl", validated);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
