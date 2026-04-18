import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp, type RateLimitPolicy } from "@/lib/rate-limit";
import { safeCallback } from "@/lib/safe-callback";

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
    // Fail closed: if Upstash is unreachable we'd rather reject signup
    // attempts than silently disable brute-force protection.
    policy: { limit: 5, windowMs: 60_000, failMode: "closed" },
  },
  {
    bucket: "auth-login",
    match: (req) =>
      req.method === "POST" &&
      req.nextUrl.pathname.startsWith("/api/auth/callback"),
    policy: { limit: 10, windowMs: 60_000, failMode: "closed" },
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
  {
    bucket: "handoff",
    // Public handoff bundle pages (feature #41). Same enumeration concern as
    // /verify — share tokens are unguessable by design, but we don't want
    // scanners hammering the DB lookup. `/handoff` (no trailing slash) is
    // the member's authenticated list page and isn't matched here.
    match: (req) => req.nextUrl.pathname.startsWith("/handoff/"),
    policy: { limit: 30, windowMs: 60_000 },
  },
  {
    bucket: "bottle-tap",
    // Public NFC tap-to-verify landing page (feature #43). Same enumeration
    // concern as /verify and /handoff — tag serials are unguessable but we
    // still cap per-IP so a scanner can't hammer the DB lookup. 30/min is
    // generous enough for an auction house doing a bulk check-in but tight
    // enough to starve a brute-force attempt.
    match: (req) => req.nextUrl.pathname.startsWith("/bottle/"),
    policy: { limit: 30, windowMs: 60_000 },
  },
  {
    bucket: "waitlist-submit",
    // Public waitlist POSTs (feature #49). Server actions from the /waitlist
    // marketing page arrive here as POSTs to the page path itself. Tight cap
    // to prevent dupe-spamming / enumeration; legitimate users submit once.
    match: (req) =>
      req.method === "POST" && req.nextUrl.pathname === "/waitlist",
    policy: { limit: 5, windowMs: 60_000 },
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

  // `connect-src` must include AWS S3 (and CloudFront, if used) so the
  // wine-image upload form (#18) can PUT directly to a presigned URL from
  // the browser. We allow the broad amazonaws.com / cloudfront.net domains
  // rather than the specific bucket so the same CSP works in dev, staging,
  // and prod without per-env wiring.
  // `upgrade-insecure-requests` is production-only. Chrome and Firefox
  // special-case localhost and ignore the directive in dev, but Safari
  // honors it strictly — forcing every subresource to HTTPS against a
  // plain-HTTP dev server, which silently drops CSS/fonts/JS and renders
  // the whole app unstyled.
  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' https://*.amazonaws.com https://*.cloudfront.net`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
  ];
  if (!isDev) directives.push(`upgrade-insecure-requests`);
  return directives.join("; ");
}

/**
 * Tell the browser to refuse plaintext HTTP for a year. `preload` is
 * deliberately omitted — the HSTS preload list is a one-way commitment
 * (removal takes months) and we're not ready to opt in. Gated on prod
 * so localhost dev over `http://` still works unhindered.
 */
/**
 * Accept a caller-supplied `x-request-id` only when it looks like one of
 * ours — a UUIDv4 or a short opaque hex/dash string. This lets a gateway
 * or load test propagate correlation without letting a random client
 * inject arbitrary log payload content.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function resolveRequestId(req: NextRequest): string {
  const inbound = req.headers.get("x-request-id");
  if (inbound && REQUEST_ID_PATTERN.test(inbound)) return inbound;
  return crypto.randomUUID();
}

function applySecurityHeaders(
  res: NextResponse,
  csp: string,
  pathname: string,
  requestId: string,
): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-request-id", requestId);
  // Defense-in-depth headers. CSP `frame-ancestors 'none'` supersedes
  // X-Frame-Options in modern browsers, but older clients (and some
  // embedding contexts) still honor the legacy header. Permissions-Policy
  // deny-lists browser capabilities the app never uses; if an XSS or a
  // compromised third-party script tries to reach for the camera/mic/
  // geolocation/payment APIs, the browser refuses. `nosniff` stops MIME
  // sniffing from promoting a JSON/text response into executable HTML.
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()",
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  // Keep the certificate hash / report id out of outbound Referer
  // headers. Without this, clicking any off-site link on a viewed
  // report leaks a bearer-equivalent token to the destination origin
  // (and its log drains / analytics / CDN access logs).
  if (pathname.startsWith("/verify/") || pathname.startsWith("/report/")) {
    res.headers.set("Referrer-Policy", "no-referrer");
  }
  return res;
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
  const requestId = resolveRequestId(req);

  // Forward the request id into the route handler so Node server code can
  // read it via `next/headers`. Returning NextResponse.next with an explicit
  // request.headers override replays the request with the mutated set.
  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.set("x-request-id", requestId);
  const nextWithId = () =>
    NextResponse.next({ request: { headers: forwardHeaders } });

  // --- Rate limit policy match (checked before auth so unauth scrapers count) ---
  for (const entry of POLICIES) {
    if (entry.match(req)) {
      const ip = clientIp(req.headers);
      const result = await checkRateLimit(`${entry.bucket}:${ip}`, entry.policy);
      if (!result.allowed) {
        const res = tooManyRequestsResponse(result.resetAt);
        res.headers.set("x-request-id", requestId);
        return res;
      }
      break;
    }
  }

  // --- Public paths — no auth required ---
  // /verify/[hash] is intentionally public (third-party provenance check).
  // /report/[id] (and legacy /certificate/[id]) is auth-protected; the page enforces ownership.
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/health" ||
    // Handoff bundle pages (feature #41). The token-bearing path is public
    // so auction houses and brokers can view without a login; the member's
    // list page at `/handoff` (no trailing slash) stays authenticated.
    pathname.startsWith("/handoff/") ||
    // Public NFC tap-to-verify landing page (feature #43). Tag serials are
    // unguessable; the page enforces its own rate limit (see POLICIES above)
    // and logs every successful lookup.
    pathname.startsWith("/bottle/") ||
    // Pre-launch founding-member waitlist landing page (feature #49). The
    // page + its server action POST are both unauthenticated by design.
    pathname === "/waitlist" ||
    // Cron endpoints are auth'd via shared-secret Bearer token (CRON_SECRET),
    // not session cookies. Let them through the auth gate; the route handler
    // rejects unauthenticated invocations itself.
    pathname.startsWith("/api/cron/") ||
    // Sentinel device ingest (feature #21). Auth'd via Bearer
    // SENTINEL_INGEST_SECRET inside the route handler, not session cookies.
    pathname.startsWith("/api/ingest/") ||
    // SES bounce/complaint webhook (#19 follow-up). Auth IS the SNS
    // signature verification done inside the route — there's no shared
    // secret because SNS doesn't carry one, so this endpoint must be
    // reachable without a session cookie for AWS to deliver to it.
    pathname === "/api/ses/webhook";

  if (isPublic) {
    return applySecurityHeaders(nextWithId(), csp, pathname, requestId);
  }

  // --- Protected paths — require auth ---
  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    const validated = safeCallback(pathname);
    if (validated) loginUrl.searchParams.set("callbackUrl", validated);
    return applySecurityHeaders(
      NextResponse.redirect(loginUrl),
      csp,
      pathname,
      requestId,
    );
  }

  // --- Onboarding gate ---
  // New members are routed through the guided walkthrough at /onboarding
  // before they can reach the rest of the app. Server actions called from
  // the wizard live under /api but the wizard itself uses Next.js server
  // actions (not REST), so we only need to allow the /onboarding route +
  // the framework's internal action POSTs (Next routes those to the same
  // page path, which is already allowed).
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  if (!token.onboarded && !isOnboardingRoute) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/onboarding", req.url)),
      csp,
      pathname,
      requestId,
    );
  }
  if (token.onboarded && isOnboardingRoute) {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/", req.url)),
      csp,
      pathname,
      requestId,
    );
  }

  // --- Admin gate (feature #28) ---
  // The /admin panel is staff-only. Non-admins bounce to the dashboard
  // rather than 403 — keeps the surface undiscoverable to members.
  if (pathname.startsWith("/admin") && token.role !== "admin") {
    return applySecurityHeaders(
      NextResponse.redirect(new URL("/", req.url)),
      csp,
      pathname,
      requestId,
    );
  }

  return applySecurityHeaders(nextWithId(), csp, pathname, requestId);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
