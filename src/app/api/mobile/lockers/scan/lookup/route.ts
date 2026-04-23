import { NextRequest, NextResponse } from "next/server";
import { requireMobileMember, requireMobileRole } from "@/lib/mobile-auth";
import { LockerScanLookupBodySchema, parseOr400 } from "@/lib/schemas";
import { lookupWineByBarcode } from "@/lib/locker-scan";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const forbidden = requireMobileRole(auth.member.role, "staff");
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(LockerScanLookupBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const wines = await lookupWineByBarcode(parsed.data);
  return NextResponse.json({ ok: true, wines });
}

