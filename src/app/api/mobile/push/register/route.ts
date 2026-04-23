import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requireMobileMember } from "@/lib/mobile-auth";
import { MobilePushRegisterBodySchema, parseOr400 } from "@/lib/schemas";

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
  const parsed = parseOr400(MobilePushRegisterBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const { expoPushToken, platform, deviceName } = parsed.data;

  await prisma.mobilePushToken.upsert({
    where: { expoPushToken },
    update: {
      memberId: auth.member.id,
      active: true,
      ...(platform ? { platform } : {}),
      ...(deviceName ? { deviceName } : {}),
    },
    create: {
      memberId: auth.member.id,
      expoPushToken,
      active: true,
      ...(platform ? { platform } : {}),
      ...(deviceName ? { deviceName } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

