import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Role, Tier } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

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
