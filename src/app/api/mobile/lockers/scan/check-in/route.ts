import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireMobileMember, requireMobileRole } from "@/lib/mobile-auth";
import { LockerCheckInBodySchema, parseOr400 } from "@/lib/schemas";
import { checkInWine } from "@/lib/locker-scan";

export async function POST(request: NextRequest) {
  const auth = await requireMobileMember(request);
  if (!auth.ok) return auth.response;

  const forbidden = requireMobileRole(auth.member.role, "staff");
  if (forbidden) return forbidden;

  const body = await request.json().catch(() => null);
  const parsed = parseOr400(LockerCheckInBodySchema, body);
  if (!parsed.ok) return parsed.response;

  const result = await checkInWine({
    actorMemberId: auth.member.id,
    ...parsed.data,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  revalidatePath("/admin/lockers/scan");
  revalidatePath("/admin/lockers");
  revalidatePath("/locker");
  revalidatePath("/collection");
  revalidatePath("/");

  return NextResponse.json({ ok: true });
}

