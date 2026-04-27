/**
 * SES bounce + complaint webhook (#19 follow-up).
 *
 * AWS SES emits delivery feedback (Bounce, Complaint, Delivery) to an
 * SNS topic; this route is the HTTPS subscriber for that topic. Without
 * it a hard-bouncing or complaining member silently keeps "succeeding"
 * through SES, the sender reputation rots, and the member's dashboard
 * never shows why their alerts went quiet.
 *
 * Auth: SNS signature verification IS the auth. There's no shared
 * secret because SNS doesn't carry one — the public cert at
 * `SigningCertURL` (which we pin to amazonaws.com) signs every message,
 * and we reject anything that doesn't verify. The route is exempted
 * from the session middleware in `src/middleware.ts`.
 *
 * Message lifecycle:
 *   - SubscriptionConfirmation: fetch the SubscribeURL once to confirm.
 *     SNS won't deliver Notifications until this completes.
 *   - Notification (Bounce):    mark `members.email_bounced` and
 *     disable email alerts for the affected addresses.
 *   - Notification (Complaint): same, into `email_complained`.
 *   - Notification (Delivery):  ignored — SES sends these on every
 *     successful send and we don't need the noise.
 *
 * Operator setup (out of band, see CLAUDE.md):
 *   1. Create an SNS topic in the same region as the SES sender.
 *   2. Subscribe this route's URL (HTTPS) to the topic.
 *   3. In the SES Configuration Set or Identity, attach Bounce +
 *      Complaint event destinations pointing at the topic.
 */
import { NextRequest, NextResponse } from "next/server";
import { createVerify, createPublicKey } from "crypto";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 15;

// SNS pins its signing cert to its own regional domain. Anything else is
// either a misrouted message or a forgery; reject early.
const SNS_CERT_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;
const IS_DEV_OR_TEST = env.NODE_ENV === "development" || env.NODE_ENV === "test";
const ALLOWED_TOPIC_ARNS = new Set(env.AWS_SES_SNS_TOPIC_ARNS);
let allowlistMissingLogged = false;

interface SnsEnvelope {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  SubscribeURL?: string;
  Token?: string;
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Build the canonical string SNS signed for this envelope.
 *  Field set + order is fixed by the SNS spec — do NOT add or reorder.
 */
function canonicalString(env: SnsEnvelope): string | null {
  const lines: string[] = [];
  if (env.Type === "Notification") {
    lines.push("Message", env.Message);
    lines.push("MessageId", env.MessageId);
    if (env.Subject !== undefined) {
      lines.push("Subject", env.Subject);
    }
    lines.push("Timestamp", env.Timestamp);
    lines.push("TopicArn", env.TopicArn);
    lines.push("Type", env.Type);
  } else if (
    env.Type === "SubscriptionConfirmation" ||
    env.Type === "UnsubscribeConfirmation"
  ) {
    if (!env.SubscribeURL || !env.Token) return null;
    lines.push("Message", env.Message);
    lines.push("MessageId", env.MessageId);
    lines.push("SubscribeURL", env.SubscribeURL);
    lines.push("Timestamp", env.Timestamp);
    lines.push("Token", env.Token);
    lines.push("TopicArn", env.TopicArn);
    lines.push("Type", env.Type);
  } else {
    return null;
  }
  return lines.join("\n") + "\n";
}

async function verifySnsSignature(env: SnsEnvelope): Promise<boolean> {
  let certUrl: URL;
  try {
    certUrl = new URL(env.SigningCertURL);
  } catch {
    return false;
  }
  if (certUrl.protocol !== "https:" || !SNS_CERT_HOST_RE.test(certUrl.hostname)) {
    return false;
  }

  const canonical = canonicalString(env);
  if (!canonical) return false;

  let pem: string;
  try {
    const res = await fetch(certUrl.toString(), { cache: "no-store" });
    if (!res.ok) return false;
    pem = await res.text();
    if (!pem.includes("BEGIN CERTIFICATE")) return false;
  } catch {
    return false;
  }

  const algo =
    env.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";
  try {
    const publicKey = createPublicKey(pem);
    const verify = createVerify(algo);
    verify.update(canonical, "utf8");
    return verify.verify(publicKey, env.Signature, "base64");
  } catch {
    return false;
  }
}

/** Lowercase + trim a single email so it matches `members.email`, which
 *  is normalized the same way everywhere else (see EmailSchema). */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

interface BouncedRecipient { emailAddress: string }
interface BouncePayload {
  bounce?: { bounceType?: string; bouncedRecipients?: BouncedRecipient[] };
}
interface ComplainedRecipient { emailAddress: string }
interface ComplaintPayload {
  complaint?: { complainedRecipients?: ComplainedRecipient[] };
}

async function handleBounce(message: BouncePayload): Promise<number> {
  const list = message.bounce?.bouncedRecipients ?? [];
  // SES soft bounces (Transient) recover on their own — only act on
  // hard bounces (Permanent) so a one-off mailbox-full doesn't disable a
  // legitimate member's alerts forever.
  if (message.bounce?.bounceType !== "Permanent") return 0;
  const emails = list
    .map((r) => normalizeEmail(r.emailAddress))
    .filter(Boolean);
  if (emails.length === 0) return 0;
  const res = await prisma.member.updateMany({
    where: { email: { in: emails } },
    data: { emailBounced: new Date(), emailAlertsEnabled: false },
  });
  return res.count;
}

async function handleComplaint(message: ComplaintPayload): Promise<number> {
  const list = message.complaint?.complainedRecipients ?? [];
  const emails = list
    .map((r) => normalizeEmail(r.emailAddress))
    .filter(Boolean);
  if (emails.length === 0) return 0;
  const res = await prisma.member.updateMany({
    where: { email: { in: emails } },
    data: { emailComplained: new Date(), emailAlertsEnabled: false },
  });
  return res.count;
}

export async function POST(req: NextRequest) {
  // SNS hits this with content-type text/plain — don't rely on Next's
  // JSON parsing; read raw text.
  let body: SnsEnvelope;
  try {
    const raw = await req.text();
    body = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return badRequest("Invalid JSON");
  }

  const headerType = req.headers.get("x-amz-sns-message-type");
  if (!headerType || headerType !== body.Type) {
    return badRequest("Type mismatch");
  }

  // Defense in depth: SNS signature verification proves "this came from *an*
  // SNS topic", but not which one. Without a TopicArn allowlist, an attacker
  // can subscribe this endpoint to their own topic and deliver signed
  // Bounce/Complaint payloads that disable member alerts.
  if (ALLOWED_TOPIC_ARNS.size > 0) {
    if (!ALLOWED_TOPIC_ARNS.has(body.TopicArn)) {
      logger.warn("[ses/webhook] rejecting SNS message from unallowlisted topic", {
        messageId: body.MessageId,
        type: body.Type,
        topic: body.TopicArn,
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else if (!IS_DEV_OR_TEST) {
    if (!allowlistMissingLogged) {
      allowlistMissingLogged = true;
      logger.error(
        "[ses/webhook] AWS_SES_SNS_TOPIC_ARNS unset — refusing to process SNS messages",
        new Error("ses_sns_topic_allowlist_unset"),
        { type: body.Type, topic: body.TopicArn },
      );
    }
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  if (!(await verifySnsSignature(body))) {
    logger.warn("[ses/webhook] signature verification failed", {
      messageId: body.MessageId,
      type: body.Type,
    });
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  if (body.Type === "SubscriptionConfirmation") {
    if (!body.SubscribeURL) return badRequest("Missing SubscribeURL");
    let confirmUrl: URL;
    try {
      confirmUrl = new URL(body.SubscribeURL);
    } catch {
      return badRequest("Invalid SubscribeURL");
    }
    if (
      confirmUrl.protocol !== "https:" ||
      !SNS_CERT_HOST_RE.test(confirmUrl.hostname)
    ) {
      return badRequest("Untrusted SubscribeURL host");
    }
    try {
      await fetch(confirmUrl.toString(), { method: "GET", cache: "no-store" });
      // WARN-level so this shows up prominently in the log drain during
      // operator setup — pairs with the reminder in src/lib/email.ts.
      // Seeing this line once per topic is the "plumbing is wired"
      // confirmation; missing it means bounces are going into the void.
      logger.warn("[ses/webhook] subscription confirmed", {
        topic: body.TopicArn,
      });
    } catch (err) {
      logger.error("[ses/webhook] subscribe confirm failed", err, {
        topic: body.TopicArn,
      });
    }
    return NextResponse.json({ status: "confirmed" });
  }

  if (body.Type !== "Notification") {
    return NextResponse.json({ status: "ignored", reason: "unknown_type" });
  }

  let payload: { notificationType?: string } &
    BouncePayload &
    ComplaintPayload = {};
  try {
    payload = JSON.parse(body.Message);
  } catch {
    return badRequest("Invalid SES Message JSON");
  }

  if (payload.notificationType === "Bounce") {
    const updated = await handleBounce(payload);
    logger.info("[ses/webhook] bounce processed", {
      messageId: body.MessageId,
      updated,
    });
    return NextResponse.json({ status: "ok", kind: "bounce", updated });
  }

  if (payload.notificationType === "Complaint") {
    const updated = await handleComplaint(payload);
    logger.info("[ses/webhook] complaint processed", {
      messageId: body.MessageId,
      updated,
    });
    return NextResponse.json({ status: "ok", kind: "complaint", updated });
  }

  // Delivery + AmazonSnsSubscriptionSucceeded etc. — accept silently so
  // SNS doesn't mark the endpoint dead, but don't touch the DB.
  return NextResponse.json({ status: "ignored", kind: payload.notificationType ?? "unknown" });
}
