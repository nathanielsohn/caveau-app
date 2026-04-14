import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { Prisma, Role, Tier } from "@prisma/client";
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

    const parts = csrfCookie.split("|", 2);
    if (parts.length !== 2 || !parts[0] || !parts[1]) return INVALID_REQUEST;
    const [cookieToken, cookieHash] = parts;

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

    // Always hash. We attempt the insert unconditionally and let the unique
    // constraint on `email` decide whether this is a real signup or a
    // duplicate. A find-then-create has a race window where two simultaneous
    // signups for the same email both pass the find and only one of them
    // succeeds — the loser then surfaces as a 500 to the client and bypasses
    // the deliberate 201-for-everyone enumeration defense below.
    const passwordHash = await bcrypt.hash(password, 13);

    // New members are attached to the oldest facility so the locker page,
    // sentinel, and dashboard have a default scope to read from. The
    // onboarding wizard reserves a locker inside this same facility.
    const defaultFacility = await prisma.facility.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    try {
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
    } catch (e) {
      // Duplicate email — fall through to the same 201 the new-user path
      // returns. We've already burned the bcrypt CPU above so the response
      // time is indistinguishable.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return NextResponse.json({ success: true }, { status: 201 });
      }
      throw e;
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("Signup failed", error, { route: "/api/auth/signup" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
