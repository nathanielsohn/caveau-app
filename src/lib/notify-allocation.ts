/**
 * New-allocation email dispatch (feature #60).
 *
 * Called when an allocation transitions draft → published. Iterates over
 * members who are (a) eligible per decideEligibility and (b) have
 * `emailAlertsEnabled` set, and sends each one a branded "new release
 * available" email via SES.
 *
 * Mirrors the graceful-failure pattern in `src/lib/email.ts` — if SES is
 * unconfigured the function logs and no-ops; any per-recipient failure
 * is swallowed so a single bad address doesn't block the rest of the
 * dispatch. Returns the count of emails attempted + succeeded for
 * logging.
 */

import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AllocationStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { logger } from "./logger";
import { tierSpecForDbTier } from "./tiers";
import { decideEligibility } from "./allocations";
import { formatCurrency } from "./utils";

let cachedClient: SESClient | null = null;
function getClient(): SESClient {
  if (!cachedClient) {
    cachedClient = new SESClient({ region: env.AWS_REGION ?? "us-east-1" });
  }
  return cachedClient;
}

function getAppBaseUrl(): string | null {
  if (env.NEXTAUTH_URL) return env.NEXTAUTH_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface NotifyResult {
  attempted: number;
  succeeded: number;
  skippedReason?: string;
}

export async function notifyEligibleOnPublish(
  allocationId: string,
): Promise<NotifyResult> {
  const from = env.AWS_SES_FROM_EMAIL;
  if (!from) {
    console.warn(
      `[allocations] AWS_SES_FROM_EMAIL unset — skipping dispatch for allocation ${allocationId}`,
    );
    return { attempted: 0, succeeded: 0, skippedReason: "ses_unconfigured" };
  }

  try {
    const allocation = await prisma.allocation.findUnique({
      where: { id: allocationId },
    });
    if (!allocation || allocation.status !== AllocationStatus.published) {
      return {
        attempted: 0,
        succeeded: 0,
        skippedReason: "not_published",
      };
    }

    // Grab every opt-in member in one query; we filter by eligibility in
    // memory because the founding-window + tier-floor combination is
    // easier to keep in lock-step with `decideEligibility` than to
    // translate into Prisma where-clauses. At Caveau-demo scale
    // (~dozens of members) this is a rounding error.
    const members = await prisma.member.findMany({
      where: {
        emailAlertsEnabled: true,
        emailBounced: null,
        emailComplained: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        tier: true,
        foundingMember: true,
      },
    });

    const eligible = members.filter((m) =>
      decideEligibility(
        { tier: m.tier, foundingMember: m.foundingMember },
        allocation,
        // Use opensAt-ish moment — same-day publish of an allocation
        // with `foundingEarlyAccess` should include founding-only
        // recipients even when opensAt is in the future.
        new Date(),
      ).eligible,
    );

    const client = getClient();
    const subject = `[Caveau] Allocation available · ${allocation.producer} ${allocation.wineName} ${allocation.vintage}`;

    let succeeded = 0;
    for (const m of eligible) {
      try {
        await client.send(
          new SendEmailCommand({
            Source: from,
            Destination: { ToAddresses: [m.email] },
            Message: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: {
                Html: {
                  Data: buildHtml({ name: m.name, email: m.email }, allocation),
                  Charset: "UTF-8",
                },
                Text: {
                  Data: buildText({ name: m.name, email: m.email }, allocation),
                  Charset: "UTF-8",
                },
              },
            },
          }),
        );
        succeeded += 1;
      } catch (err) {
        console.error(
          `[allocations] send failed to ${m.email}:`,
          err,
        );
      }
    }

    logger.info("allocation dispatch", {
      allocationId,
      attempted: eligible.length,
      succeeded,
    });

    return { attempted: eligible.length, succeeded };
  } catch (err) {
    logger.error("notifyEligibleOnPublish failed", err, {
      action: "notifyEligibleOnPublish",
      allocationId,
    });
    return { attempted: 0, succeeded: 0, skippedReason: "dispatch_error" };
  }
}

function buildHtml(
  recipient: { name: string; email: string },
  a: {
    slug: string;
    producer: string;
    wineName: string;
    vintage: number;
    region: string;
    quantity: number;
    pricePerBottleUsd: unknown;
    minimumTier: "gold" | "reserve" | "platinum" | "black";
    foundingOnly: boolean;
    foundingEarlyAccess: boolean;
    closesAt: Date;
  },
): string {
  const tierLabel = tierSpecForDbTier(a.minimumTier).name;
  const price = formatCurrency(a.pricePerBottleUsd as number);
  const base = getAppBaseUrl();
  const cta = base ? `${base}/allocations/${a.slug}` : null;
  const closes = a.closesAt.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Caveau · Private Allocation</title>
  </head>
  <body style="margin:0;padding:0;background:#0A0A0B;color:#E8E6E1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141416;border:1px solid #2A2A30;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 16px 28px;border-bottom:1px solid #2A2A30;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="color:#FFD166;font-size:22px;line-height:1;">&#x25C8;</span>
                  <span style="font-family:Georgia,'Playfair Display',serif;font-size:20px;color:#E8E6E1;letter-spacing:0.02em;">Caveau Allocations</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFD16622;color:#FFD166;font-size:11px;font-weight:600;letter-spacing:0.08em;">${escapeHtml(tierLabel)}${a.foundingOnly ? " &middot; FOUNDING" : ""}</div>
                <h1 style="margin:14px 0 6px 0;font-family:Georgia,'Playfair Display',serif;font-size:24px;color:#E8E6E1;font-weight:500;">${escapeHtml(a.producer)}</h1>
                <p style="margin:0 0 20px 0;color:#B4B4BE;font-size:15px;line-height:1.5;">${escapeHtml(a.wineName)} &middot; ${escapeHtml(String(a.vintage))} &middot; ${escapeHtml(a.region)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F11;border:1px solid #2A2A30;border-radius:12px;margin-top:8px;">
                  <tr>
                    <td style="padding:14px 18px;font-size:13px;color:#8B8B96;">Allotted</td>
                    <td style="padding:14px 18px;font-size:13px;color:#E8E6E1;text-align:right;">${a.quantity} ${a.quantity === 1 ? "bottle" : "bottles"}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 18px;font-size:13px;color:#8B8B96;border-top:1px solid #2A2A30;">Price / bottle</td>
                    <td style="padding:14px 18px;font-size:13px;color:#E8E6E1;text-align:right;border-top:1px solid #2A2A30;">${escapeHtml(price)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 18px;font-size:13px;color:#8B8B96;border-top:1px solid #2A2A30;">Closes</td>
                    <td style="padding:14px 18px;font-size:13px;color:#E8E6E1;text-align:right;border-top:1px solid #2A2A30;">${escapeHtml(closes)}</td>
                  </tr>
                </table>

                ${
                  cta
                    ? `<div style="margin-top:24px;text-align:center;">
                         <a href="${cta}" style="display:inline-block;padding:12px 28px;background:#FFD166;color:#0A0A0B;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Request allocation</a>
                       </div>`
                    : ""
                }

                <p style="margin:24px 0 0 0;color:#8B8B96;font-size:12px;line-height:1.5;">
                  Hello ${escapeHtml(recipient.name)}, you&rsquo;re eligible for this release.${a.foundingEarlyAccess ? " Founding members see allocations first." : ""} Requests are non-binding — your concierge will confirm acceptance before any charge.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #2A2A30;background:#0F0F11;">
                <p style="margin:0;color:#6B6B76;font-size:11px;">&#x25C8; Caveau &middot; Private Allocations</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(
  recipient: { name: string; email: string },
  a: {
    slug: string;
    producer: string;
    wineName: string;
    vintage: number;
    region: string;
    quantity: number;
    pricePerBottleUsd: unknown;
    minimumTier: "gold" | "reserve" | "platinum" | "black";
    foundingOnly: boolean;
    foundingEarlyAccess: boolean;
    closesAt: Date;
  },
): string {
  const tierLabel = tierSpecForDbTier(a.minimumTier).name;
  const price = formatCurrency(a.pricePerBottleUsd as number);
  const base = getAppBaseUrl();
  const closes = a.closesAt.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  return [
    `CAVEAU — PRIVATE ALLOCATION · ${tierLabel}${a.foundingOnly ? " (FOUNDING)" : ""}`,
    "",
    `${a.producer} — ${a.wineName} ${a.vintage}`,
    `${a.region}`,
    "",
    `Allotted:       ${a.quantity} ${a.quantity === 1 ? "bottle" : "bottles"}`,
    `Price / bottle: ${price}`,
    `Closes:         ${closes}`,
    "",
    `Hello ${recipient.name},`,
    "You're eligible for this release.",
    a.foundingEarlyAccess ? "Founding members see allocations first." : "",
    ...(base ? ["", `Request allocation: ${base}/allocations/${a.slug}`] : []),
    "",
    "— Caveau Allocations",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
