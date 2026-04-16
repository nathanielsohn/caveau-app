"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";

/**
 * Mark an alert as resolved. Admin-only; role is re-checked here so the
 * mutation remains safe even if the layout/middleware gates are bypassed.
 */
export async function resolveAlertAction(
  alertId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin") {
    return { ok: false, error: "Forbidden" };
  }
  if (!alertId) return { ok: false, error: "Missing alert ID" };

  await prisma.alert.update({
    where: { id: alertId },
    data: { resolved: true },
  });

  revalidatePath("/admin/alerts");
  revalidatePath("/admin");
  return { ok: true };
}
