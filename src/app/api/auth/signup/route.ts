import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { Role, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

    // Verify the hash: sha256(token + secret) must equal the stored hash
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const expectedHash = createHash("sha256")
      .update(`${cookieToken}${secret}`)
      .digest("hex");

    if (cookieHash !== expectedHash) {
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    }

    if (!name || !email || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNormalized)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const existing = await prisma.member.findUnique({ where: { email: emailNormalized } });
    if (existing) {
      return NextResponse.json({ error: "Unable to create account" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.member.create({
      data: {
        name: name.trim(),
        email: emailNormalized,
        passwordHash,
        tier: Tier.gold,
        role: Role.member,
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
