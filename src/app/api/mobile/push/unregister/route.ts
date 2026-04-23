import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireMobileMember } from "@/lib/mobile-auth";
import { MobilePushUnregisterBodySchema, parseOr400 } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  if (!env.EXPO_PUSH_ENABLED) {
    return NextResponse.json(
      {
        error:
          "Push notifications are not configured for this environment. Ask an administrator to enable EXPO_PUSH_ENABLED.",
      },
      { status: 503 },
    );
  }

  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(MobilePushUnregisterBodySchema, body);
  if (!parsed.ok) return parsed.response;

  await prisma.mobilePushToken.updateMany({
    where: { memberId: auth.member.id, expoPushToken: parsed.data.expoPushToken },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}

