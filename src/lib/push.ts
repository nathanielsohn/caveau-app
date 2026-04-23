import { env } from "./env";
import { prisma } from "./prisma";

type ExpoPushTicket =
  | { status: "ok"; id?: string }
  | { status: "error"; message?: string; details?: { error?: string } };

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_MESSAGES_PER_REQUEST = 100;
const EXPO_PUSH_TOKEN_SHAPE = /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function pushEnabled(): boolean {
  return env.EXPO_PUSH_ENABLED;
}

export async function sendAlertPush(input: {
  memberId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  if (!env.EXPO_PUSH_ENABLED) return false;

  const rows = await prisma.mobilePushToken.findMany({
    where: { memberId: input.memberId, active: true },
    select: { expoPushToken: true },
  });
  const tokens = rows
    .map((r) => r.expoPushToken)
    .filter((t) => EXPO_PUSH_TOKEN_SHAPE.test(t));
  if (tokens.length === 0) return false;

  const messages = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    sound: "default",
    ...(input.data ? { data: input.data } : {}),
  }));

  const invalidTokens = new Set<string>();
  let delivered = 0;

  for (const batch of chunk(messages, MAX_MESSAGES_PER_REQUEST)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(env.EXPO_PUSH_ACCESS_TOKEN
            ? { Authorization: `Bearer ${env.EXPO_PUSH_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(batch),
      });

      const json = (await res.json().catch(() => null)) as
        | null
        | { data?: ExpoPushTicket[] };
      const tickets = json?.data ?? [];

      for (let i = 0; i < tickets.length; i += 1) {
        const ticket = tickets[i];
        const token = batch[i]?.to;
        if (!ticket || !token) continue;
        if (ticket.status === "ok") {
          delivered += 1;
          continue;
        }
        const err = ticket.details?.error;
        if (err === "DeviceNotRegistered") {
          invalidTokens.add(token);
        }
      }
    } catch (err) {
      console.error("[push] send failed:", err);
    }
  }

  if (invalidTokens.size > 0) {
    const list = Array.from(invalidTokens);
    void prisma.mobilePushToken.updateMany({
      where: { expoPushToken: { in: list } },
      data: { active: false },
    });
  }

  return delivered > 0;
}

