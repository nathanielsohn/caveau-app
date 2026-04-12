import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { Role, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const { name, email, password, csrfToken } = await req.json();

    // Verify CSRF double-submit cookie
    const cookieStore = cookies();
    const csrfCookie =
      cookieStore.get("next-auth.csrf-token")?.value ||
      cookieStore.get("__Host-next-auth.csrf-token")?.value;

    if (!csrfToken || !csrfCookie) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    // NextAuth cookie format: token|hash — verify both token match and hash integrity
    const separatorIndex = csrfCookie.indexOf("|");
    if (separatorIndex === -1) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    const cookieToken = csrfCookie.slice(0, separatorIndex);
    const cookieHash = csrfCookie.slice(separatorIndex + 1);

    // Verify the submitted token matches the cookie token
    if (csrfToken !== cookieToken) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    // Verify the hash: sha256(token + secret) must equal the stored hash.
    // env.NEXTAUTH_SECRET is asserted at boot, so we can trust it here.
    const expectedHash = createHash("sha256")
      .update(`${cookieToken}${env.NEXTAUTH_SECRET}`)
      .digest("hex");

    if (cookieHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const nameTrimmed = name.trim();
    if (!nameTrimmed || nameTrimmed.length > 200) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();
    // RFC 5321 caps the full address at 254 chars. Practical regex covers
    // local@domain.tld with no whitespace; we don't aim for full RFC 5322.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailNormalized.length > 254 || !emailRegex.test(emailNormalized)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (password.length > 200) {
      return NextResponse.json({ error: "Password too long" }, { status: 400 });
    }

    if (password.length < 10) {
      return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 400 });
    }

    // Require at least one uppercase, one lowercase, and one digit
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json(
        { error: "Password must include uppercase, lowercase, and a number" },
        { status: 400 },
      );
    }

    const existing = await prisma.member.findUnique({ where: { email: emailNormalized } });
    if (existing) {
      // Return 201 to prevent user enumeration — don't reveal whether account exists
      return NextResponse.json({ success: true }, { status: 201 });
    }

    const passwordHash = await bcrypt.hash(password, 13);

    await prisma.member.create({
      data: {
        name: nameTrimmed,
        email: emailNormalized,
        passwordHash,
        tier: Tier.gold,
        role: Role.member,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("Signup failed", error, { route: "/api/auth/signup" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
