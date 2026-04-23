import { NextRequest, NextResponse } from "next/server";
import { Role, Tier } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyMobileToken } from "./mobile-token";

export type MobileMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  tier: Tier;
};

function bearerTokenFromRequest(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme !== "Bearer" || !value) return null;
  return value.trim();
}

export async function requireMobileMember(
  request: NextRequest,
): Promise<
  | { ok: true; member: MobileMember; tokenPayload: { exp: number } }
  | { ok: false; response: NextResponse }
> {
  const token = bearerTokenFromRequest(request);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const verified = verifyMobileToken(token);
  if (!verified.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { sub: memberId, sv: tokenSessionVersion } = verified.payload;
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      tier: true,
      sessionVersion: true,
    },
  });
  if (!member) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if ((member.sessionVersion ?? 0) !== (tokenSessionVersion ?? 0)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  return {
    ok: true,
    member: {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      tier: member.tier,
    },
    tokenPayload: { exp: verified.payload.exp },
  };
}

/** Role hierarchy: admin > staff > member */
const ROLE_LEVEL: Record<Role, number> = {
  [Role.admin]: 3,
  [Role.staff]: 2,
  [Role.member]: 1,
};

export function requireMobileRole(
  role: Role,
  minimum: Role,
): NextResponse | null {
  const level = ROLE_LEVEL[role] ?? 0;
  const required = ROLE_LEVEL[minimum];
  if (level < required) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

