import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema, parsePathParamOr404 } from "@/lib/schemas";
import { buildProvenanceBundle } from "@/lib/provenance";
import { renderProvenancePdf } from "@/lib/provenance-pdf";

export const dynamic = "force-dynamic";

/**
 * Provenance bundle export (feature #40).
 *
 * Same ownership model as `/api/certificates/[id]` — the bundle builder
 * scopes the certificate lookup by `wine.memberId`, so a member can only
 * export their own bottles. Both "no such certificate" and "not your
 * certificate" return 404 to prevent enumeration.
 *
 * Two formats: `?format=json` returns the signed bundle (machine-verifiable),
 * `?format=pdf` returns a print-ready PDF for the human auditor. JSON is the
 * default because it's the format other systems will consume.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const idResult = parsePathParamOr404(UuidSchema, rawId);
  if (!idResult.ok) return idResult.response;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "json";

  const bundle = await buildProvenanceBundle(idResult.data, session.user.id);
  if (!bundle) {
    return NextResponse.json(
      { error: "Certificate not found" },
      { status: 404 },
    );
  }

  const filenameBase = `caveau-provenance-${bundle.certificateNumber}`;

  if (format === "pdf") {
    const bytes = await renderProvenancePdf(bundle);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
