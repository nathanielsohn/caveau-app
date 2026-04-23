import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { MobileLoginBodySchema, parseOr400 } from "@/lib/schemas";
import { createMobileToken } from "@/lib/mobile-token";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const ip = clientIp(headers());
  const limit = await checkRateLimit(`mobile-login:${ip}`, {
    limit: 10,
    windowMs: 60_000,
    failMode: "closed",
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(MobileLoginBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const email = parsed.data.email.toLowerCase().trim();
  const member = await prisma.member.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tier: true,
      passwordHash: true,
      sessionVersion: true,
    },
  });

  if (!member?.passwordHash) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const ok = await bcrypt.compare(parsed.data.password, member.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { token, expiresAt } = createMobileToken({
    memberId: member.id,
    sessionVersion: member.sessionVersion,
  });

  return NextResponse.json(
    {
      token,
      expiresAt: expiresAt.toISOString(),
      member: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        tier: member.tier,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

