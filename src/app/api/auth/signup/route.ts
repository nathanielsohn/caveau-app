import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { Role, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { SignupBodySchema, parseOr400 } from "@/lib/schemas";

// Single generic 4xx body for any pre-validation failure (CSRF, malformed
// JSON, missing cookies). We deliberately do NOT distinguish CSRF failure from
// validation failure to clients — both leak information about which step the
// attacker tripped.
const INVALID_REQUEST = NextResponse.json(
  { error: "Invalid request" },
  { status: 400 },
);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return INVALID_REQUEST;

    // CSRF double-submit cookie verification — must run before schema parsing
    // so that an unauthenticated probe can't even get past the gate.
    const cookieStore = cookies();
    const csrfCookie =
      cookieStore.get("next-auth.csrf-token")?.value ||
      cookieStore.get("__Host-next-auth.csrf-token")?.value;

    const submittedCsrf =
      typeof (body as { csrfToken?: unknown }).csrfToken === "string"
        ? ((body as { csrfToken: string }).csrfToken)
        : null;

    if (!submittedCsrf || !csrfCookie) return INVALID_REQUEST;

    const separatorIndex = csrfCookie.indexOf("|");
    if (separatorIndex === -1) return INVALID_REQUEST;

    const cookieToken = csrfCookie.slice(0, separatorIndex);
    const cookieHash = csrfCookie.slice(separatorIndex + 1);

    if (!safeEqual(submittedCsrf, cookieToken)) return INVALID_REQUEST;

    // env.NEXTAUTH_SECRET is asserted at boot.
    const expectedHash = createHash("sha256")
      .update(`${cookieToken}${env.NEXTAUTH_SECRET}`)
      .digest("hex");

    if (!safeEqual(cookieHash, expectedHash)) return INVALID_REQUEST;

    // Schema-validated body. Email regex, length caps, and password policy
    // all live in src/lib/schemas.ts.
    const parsed = parseOr400(SignupBodySchema, body);
    if (!parsed.ok) return parsed.response;

    const { name, email, password } = parsed.data;

    const existing = await prisma.member.findUnique({ where: { email } });
    if (existing) {
      // Return 201 to prevent user enumeration. Note: a sophisticated attacker
      // could still side-channel via timing because we skip the bcrypt.hash
      // call below; for that we'd need to bcrypt.hash anyway and discard. The
      // bcrypt cost is significant (~250ms) so we accept the small leak for
      // now and revisit when this becomes a real attack vector.
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const passwordHash = await bcrypt.hash(password, 13);

    // New members are attached to the oldest facility so the locker page,
    // sentinel, and dashboard have a default scope to read from. The
    // onboarding wizard reserves a locker inside this same facility.
    const defaultFacility = await prisma.facility.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    await prisma.member.create({
      data: {
        name,
        email,
        passwordHash,
        tier: Tier.gold,
        role: Role.member,
        ...(defaultFacility && {
          facilities: {
            create: { facilityId: defaultFacility.id },
          },
        }),
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("Signup failed", error, { route: "/api/auth/signup" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
