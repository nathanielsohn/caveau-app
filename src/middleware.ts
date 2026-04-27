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
    bucket: "mobile-login",
    match: (req) =>
      req.method === "POST" && req.nextUrl.pathname === "/api/mobile/login",
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
    bucket: "handoff-driver",
    // Public driver-side delivery ladder (feature #51). 256-bit driver
    // tokens are unguessable; the IP limit exists so a scanner can't
    // hammer the DB looking for a token that resolves.
    match: (req) => req.nextUrl.pathname.startsWith("/handoff-driver/"),
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
  {
    bucket: "event-signup",
    // Public event signup POSTs (feature #53). Server actions from the
    // /events/[slug] page arrive here as POSTs to the page path. Same
    // tight cap as /waitlist so a scanner can't dupe-spam an event.
    match: (req) =>
      req.method === "POST" && req.nextUrl.pathname.startsWith("/events/"),
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

  // `connect-src` must include the S3 bucket (presigned PUT uploads,
  // feature #18) and the CloudFront distribution (public reads). We
  // derive the exact hostnames from env so the policy doesn't wildcard
  // *.amazonaws.com — an attacker who compromises any other service on
  // the AWS shared domain shouldn't inherit our CSP. Dev and previews
  // that don't have the bucket/CDN set still get a working 'self' policy.
  const bucket = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION ?? "us-east-1";
  const cfDomain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const awsConnectSources: string[] = [];
  if (bucket) {
    // Both virtual-hosted (`bucket.s3.region.amazonaws.com`) and
    // path-style (`s3.region.amazonaws.com/bucket`) are accepted by the
    // S3 API; presigned URLs we issue use virtual-hosted, so that's what
    // the browser will dial — but we allow the path-style host too so a
    // future SDK change doesn't silently break uploads.
    awsConnectSources.push(
      `https://${bucket}.s3.${region}.amazonaws.com`,
      `https://s3.${region}.amazonaws.com`,
    );
  }
  if (cfDomain) {
    awsConnectSources.push(`https://${cfDomain}`);
  }

  // `upgrade-insecure-requests` is production-only. Chrome and Firefox
  // special-case localhost and ignore the directive in dev, but Safari
  // honors it strictly — forcing every subresource to HTTPS against a
  // plain-HTTP dev server, which silently drops CSS/fonts/JS and renders
  // the whole app unstyled.
  const connectSrc = ["'self'", ...awsConnectSources].join(" ");
  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc}`,
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
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
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
  } else {
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
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
    // Mobile companion app bearer-token API (feature #29). Auth is the
    // Authorization: Bearer token checked inside /api/mobile/*, not a
    // NextAuth cookie session.
    pathname.startsWith("/api/mobile/") ||
    pathname === "/api/health" ||
    // Handoff bundle pages (feature #41). The token-bearing path is public
    // so auction houses and brokers can view without a login; the member's
    // list page at `/handoff` (no trailing slash) stays authenticated.
    pathname.startsWith("/handoff/") ||
    // Driver-side delivery ladder (feature #51). The Caveau courier opens
    // a tokenized URL on their phone; no member session. The token itself
    // (256 bits, base64url) is the bearer credential.
    pathname.startsWith("/handoff-driver/") ||
    // Door-side delivery API routes keyed by driverToken. Auth IS the
    // token, checked inside each route handler via loadDeliveryByDriverToken.
    pathname.startsWith("/api/deliveries/by-token/") ||
    // Public NFC tap-to-verify landing page (feature #43). Tag serials are
    // unguessable; the page enforces its own rate limit (see POLICIES above)
    // and logs every successful lookup.
    pathname.startsWith("/bottle/") ||
    // Pre-launch founding-member waitlist landing page (feature #49). The
    // page + its server action POST are both unauthenticated by design.
    pathname === "/waitlist" ||
    // Public events list + detail pages (feature #53). Non-members browse
    // the list and submit a lead via the event-scoped signup form on the
    // detail page; authenticated members get a richer RSVP UI on the same
    // URL. Draft and cancelled events 404 at the page layer.
    pathname === "/events" ||
    pathname.startsWith("/events/") ||
    // Allocations list (feature #60). Unauthenticated visitors see the
    // anonymized teaser + waitlist CTA; authenticated members see the
    // eligibility-gated feed. The detail page at /allocations/[slug]
    // stays auth-gated — it calls redirect() itself if unauthenticated.
    pathname === "/allocations" ||
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
    pathname === "/api/ses/webhook" ||
    // Stripe webhook (feature #27). Auth IS the Stripe signature
    // verification done inside the route handler — Stripe can't present
    // a session cookie.
    pathname === "/api/stripe/webhook" ||
    // Insurance partner APIs (feature #31). Auth'd via shared-secret Bearer
    // token (INSURANCE_API_SECRET) inside the route handler, not session
    // cookies. Carriers and agents need to access without a Caveau login.
    pathname.startsWith("/api/insurance/");

  if (isPublic) {
    return applySecurityHeaders(nextWithId(), csp, pathname, requestId);
  }

  // --- Protected paths — require auth ---
  // Force `getToken` to use the cookie prefix that matches the actual request
  // protocol. next-auth's default `secureCookie` heuristic uses
  // `process.env.NEXTAUTH_URL?.startsWith("https://")`, which breaks if
  // NEXTAUTH_URL is set without a scheme (common on Vercel) — the auth route
  // still issues `__Secure-next-auth.session-token` cookies, but middleware
  // would look for the unprefixed name and treat every request as signed-out.
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || req.nextUrl.protocol.replace(":", "");
  const token = await getToken({ req, secureCookie: proto === "https" });

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
