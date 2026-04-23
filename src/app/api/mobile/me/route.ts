import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember } from "@/lib/mobile-auth";

export async function GET(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    member: auth.member,
    tokenExpiresAt: new Date(auth.tokenPayload.exp * 1000).toISOString(),
  });
}
