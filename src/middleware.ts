import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/*  In-memory rate limiter (per-IP, 5 requests / 60s window)          */
/* ------------------------------------------------------------------ */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Expired or first request — start a new window
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  return false;
}

/* ------------------------------------------------------------------ */
/*  Content-Security-Policy builder (per-request nonce)               */
/* ------------------------------------------------------------------ */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  // In dev, keep unsafe-eval for HMR / Fast Refresh.
  // unsafe-inline is a fallback for browsers that don't support nonces;
  // modern browsers ignore it when a nonce is present.
  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'unsafe-inline'`;

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
  ].join("; ");
}

/* ------------------------------------------------------------------ */
/*  Middleware                                                         */
/* ------------------------------------------------------------------ */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- Generate per-request nonce for CSP ---
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // --- Rate-limit auth endpoints (POST only) ---
  const isAuthPost =
    req.method === "POST" &&
    (pathname === "/api/auth/signup" ||
      pathname.startsWith("/api/auth/callback"));

  if (isAuthPost) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }
  }

  // --- Public paths — no auth required ---
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/certificate") ||
    pathname.startsWith("/api/auth");

  if (isPublic) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    res.headers.set("x-nonce", nonce);
    return res;
  }

  // --- Protected paths — require auth ---
  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
