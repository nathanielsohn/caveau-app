"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HandoffChannel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { generateShareToken } from "@/lib/handoff";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { EmailSchema, parseOr400 } from "@/lib/schemas";

const CreatePackageSchema = z.object({
  wineId: z.string().uuid(),
  recipientName: z.string().trim().min(1).max(200),
  recipientEmail: EmailSchema,
  channel: z.nativeEnum(HandoffChannel),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});

export interface CreatePackageResult {
  ok: boolean;
  shareToken?: string;
  error?: string;
}

/**
 * Create a handoff package for one of the member's wines and return the
 * share token. The caller builds the public URL from the token so we don't
 * bake the origin into the server layer.
 */
export async function createHandoffPackage(
  formData: FormData,
): Promise<CreatePackageResult> {
  const session = await getServerAuth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };

  const ip = clientIp(await headers());
  const limit = await checkRateLimit(
    `handoff-create:${session.user.id}:${ip}`,
    { limit: 20, windowMs: 60_000 },
  );
  if (!limit.allowed) return { ok: false, error: "Too many requests" };

  const rawExpires = formData.get("expiresInDays");
  const parsed = parseOr400(CreatePackageSchema, {
    wineId: formData.get("wineId"),
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail"),
    channel: formData.get("channel"),
    expiresInDays:
      typeof rawExpires === "string" && rawExpires.length > 0
        ? rawExpires
        : undefined,
  });
  if (!parsed.ok) return { ok: false, error: "Invalid package details" };

  const wine = await prisma.wine.findFirst({
    where: { id: parsed.data.wineId, memberId: session.user.id },
    select: { id: true },
  });
  if (!wine) return { ok: false, error: "Wine not found" };

  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const shareToken = generateShareToken();
  await prisma.handoffPackage.create({
    data: {
      wineId: wine.id,
      memberId: session.user.id,
      recipientName: parsed.data.recipientName,
      recipientEmail: parsed.data.recipientEmail,
      channel: parsed.data.channel,
      shareToken,
      expiresAt,
    },
  });

  revalidatePath("/handoff");
  return { ok: true, shareToken };
}
