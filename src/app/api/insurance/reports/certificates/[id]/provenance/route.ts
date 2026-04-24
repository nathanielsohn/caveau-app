import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { buildProvenanceBundle } from "@/lib/provenance";
import { renderProvenancePdf } from "@/lib/provenance-pdf";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

function notConfigured(): NextResponse {
  return NextResponse.json({ error: "not_configured" }, { status: 503 });
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function isConfigured(): boolean {
  if (!env.INSURANCE_PARTNER_ENABLED) return false;
  if (env.INSURANCE_API_SECRET) return true;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

function authorized(req: NextRequest): boolean {
  const expected = env.INSURANCE_API_SECRET;
  if (!expected) {
    return env.NODE_ENV === "development" || env.NODE_ENV === "test";
  }
  const header = req.headers.get("authorization") ?? "";
  const expectedHeader = `Bearer ${expected}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expectedHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isConfigured()) return notConfigured();
  if (!authorized(request)) return unauthorized();

  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token") ?? "";
  const token = UuidSchema.safeParse(rawToken);
  if (!token.success) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const referral = await prisma.insuranceReferral.findUnique({
    where: { shareToken: token.data },
    select: { memberId: true, status: true },
  });
  if (!referral || referral.status === "cancelled") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;

  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "json";

  const bundle = await buildProvenanceBundle(idResult.data, referral.memberId);
  if (!bundle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filenameBase = `caveau-provenance-${bundle.certificateNumber}`;

  if (format === "pdf") {
    const bytes = await renderProvenancePdf(bundle);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

