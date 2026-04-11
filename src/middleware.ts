import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths — no auth required
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/certificate") ||
    pathname.startsWith("/api/auth");

  if (isPublic) return NextResponse.next();

  const token = await getToken({ req });

  if (!token) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
