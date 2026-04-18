/**
 * AWS SES email client for alert notifications (feature #19).
 *
 * Keeps two environment variables optional:
 *   - AWS_REGION           e.g. "us-east-1"
 *   - AWS_SES_FROM_EMAIL   verified sender, e.g. "alerts@caveau.com"
 *
 * If `AWS_SES_FROM_EMAIL` is not set, `sendAlertEmail` no-ops and logs a
 * warning so local dev keeps working without AWS credentials. Any SES
 * failure is swallowed and logged — email must NEVER block alert creation.
 *
 * SES client is lazily instantiated so importing this module in code paths
 * that never send email (e.g. the build step) does not touch AWS config.
 */
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { env } from "./env";

type Severity = "info" | "warning" | "critical";

export interface AlertEmailPayload {
  severity: Severity;
  type: string;
  message: string;
  timestamp: Date;
  lockerNumber: number;
  lockerZone: string;
}

export interface AlertEmailRecipient {
  name: string;
  email: string;
}

let cachedClient: SESClient | null = null;
function getClient(): SESClient {
  if (!cachedClient) {
    cachedClient = new SESClient({ region: env.AWS_REGION ?? "us-east-1" });
  }
  return cachedClient;
}

/** Short human label for alert type codes. */
function typeLabel(type: string): string {
  switch (type) {
    case "temperature":
      return "Temperature";
    case "humidity":
      return "Humidity";
    case "vibration":
      return "Vibration";
    case "light":
      return "Light Exposure";
    case "door":
      return "Door";
    case "access":
      return "Access";
    default:
      return type;
  }
}

/** Severity → accent color matching the Caveau palette. */
function severityColor(severity: Severity): string {
  if (severity === "critical") return "#F87171";
  if (severity === "warning") return "#FBBF24";
  return "#60A5FA";
}

/**
 * Pick a public origin to deep-link into the app from email body. Falls
 * back through NEXTAUTH_URL → VERCEL_URL → null. Returning null is fine —
 * the email body just omits the CTA link and reverts to plain copy.
 */
function getAppBaseUrl(): string | null {
  if (env.NEXTAUTH_URL) return env.NEXTAUTH_URL.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return null;
}

function buildHtml(recipient: AlertEmailRecipient, alert: AlertEmailPayload): string {
  const accent = severityColor(alert.severity);
  const when = alert.timestamp.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const severityLabel = alert.severity.toUpperCase();
  const baseUrl = getAppBaseUrl();
  const settingsLink = baseUrl
    ? `<a href="${baseUrl}/settings" style="color:#FFD166;text-decoration:underline;">Caveau settings</a>`
    : "Caveau settings";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Caveau Sentinel Alert</title>
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
                  <span style="font-family:Georgia,'Playfair Display',serif;font-size:20px;color:#E8E6E1;letter-spacing:0.02em;">Caveau Sentinel</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${accent}22;color:${accent};font-size:11px;font-weight:600;letter-spacing:0.08em;">${severityLabel}</div>
                <h1 style="margin:14px 0 8px 0;font-family:Georgia,'Playfair Display',serif;font-size:22px;color:#E8E6E1;font-weight:500;">${typeLabel(alert.type)} alert</h1>
                <p style="margin:0 0 20px 0;color:#B4B4BE;font-size:15px;line-height:1.5;">${escapeHtml(alert.message)}</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F0F11;border:1px solid #2A2A30;border-radius:12px;margin-top:8px;">
                  <tr>
                    <td style="padding:14px 18px;font-size:13px;color:#8B8B96;">Locker</td>
                    <td style="padding:14px 18px;font-size:13px;color:#E8E6E1;text-align:right;">#${alert.lockerNumber} &middot; ${escapeHtml(alert.lockerZone)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 18px;font-size:13px;color:#8B8B96;border-top:1px solid #2A2A30;">Detected</td>
                    <td style="padding:14px 18px;font-size:13px;color:#E8E6E1;text-align:right;border-top:1px solid #2A2A30;">${escapeHtml(when)}</td>
                  </tr>
                </table>

                <p style="margin:24px 0 0 0;color:#8B8B96;font-size:12px;line-height:1.5;">
                  Hello ${escapeHtml(recipient.name)},<br />
                  This automated alert was sent because one of your lockers breached its environmental threshold. You can adjust or disable email alerts in your ${settingsLink}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;border-top:1px solid #2A2A30;background:#0F0F11;">
                <p style="margin:0;color:#6B6B76;font-size:11px;">&#x25C8; Caveau &middot; Luxury Wine Storage &middot; Sentinel Monitoring</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(recipient: AlertEmailRecipient, alert: AlertEmailPayload): string {
  const when = alert.timestamp.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const baseUrl = getAppBaseUrl();
  return [
    `CAVEAU SENTINEL — ${alert.severity.toUpperCase()} ALERT`,
    "",
    `${typeLabel(alert.type)} alert`,
    alert.message,
    "",
    `Locker:   #${alert.lockerNumber} — ${alert.lockerZone}`,
    `Detected: ${when}`,
    "",
    `Hello ${recipient.name},`,
    "This automated alert was sent because one of your lockers breached its",
    "environmental threshold. You can adjust or disable email alerts in your",
    "Caveau settings.",
    ...(baseUrl ? ["", `Manage alerts: ${baseUrl}/settings`] : []),
    "",
    "— Caveau Sentinel",
  ].join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Process-scoped reminder so the first alert email out of each Lambda cold
// start leaves a visible log line asking the operator to verify the SNS
// bounce/complaint webhook is wired. SES silently swallows feedback for a
// misconfigured subscription, so without this we'd never know bouncing
// members are missing alerts. One line per process is enough — Vercel log
// drains bucket on the message string, so the operator sees the reminder
// until they confirm the subscription manually.
let webhookReminderSent = false;

function maybeLogWebhookReminder(): void {
  if (webhookReminderSent) return;
  webhookReminderSent = true;
  console.warn(
    JSON.stringify({
      level: "warn",
      msg: "[email] First SES send from this process — confirm SNS Bounce/Complaint subscription is active at /api/ses/webhook or bouncing members will be silently dropped.",
    }),
  );
}

/**
 * Send a branded alert email via AWS SES.
 * Returns `true` on success, `false` on any failure or missing config.
 * Never throws.
 */
export async function sendAlertEmail(
  recipient: AlertEmailRecipient,
  alert: AlertEmailPayload,
): Promise<boolean> {
  const from = env.AWS_SES_FROM_EMAIL;
  if (!from) {
    // Dev / preview environments: noisy console warning, no crash.
    console.warn(
      `[email] AWS_SES_FROM_EMAIL unset — skipping alert email to ${recipient.email}`,
    );
    return false;
  }

  try {
    const client = getClient();
    const subject = `[Caveau] ${alert.severity.toUpperCase()} · ${typeLabel(alert.type)} alert — Locker #${alert.lockerNumber}`;
    await client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [recipient.email] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: buildHtml(recipient, alert), Charset: "UTF-8" },
            Text: { Data: buildText(recipient, alert), Charset: "UTF-8" },
          },
        },
      }),
    );
    maybeLogWebhookReminder();
    return true;
  } catch (err) {
    // Never let email delivery break alert creation. Log and move on.
    console.error("[email] sendAlertEmail failed:", err);
    return false;
  }
}
