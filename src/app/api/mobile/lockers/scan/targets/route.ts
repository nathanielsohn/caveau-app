import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember, requireMobileRole } from "@/lib/mobile-auth";
import { LockerScanTargetsBodySchema, parseOr400 } from "@/lib/schemas";
import { getCheckInTargets } from "@/lib/locker-scan";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const forbidden = requireMobileRole(auth.member.role, "staff");
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(LockerScanTargetsBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const result = await getCheckInTargets(parsed.data);
  if (!result) {
    return NextResponse.json({ ok: false, error: "Wine not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, ...result });
}

