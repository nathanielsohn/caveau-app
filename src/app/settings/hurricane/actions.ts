"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function toggleHurricaneProtection(
  formData: FormData,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return { ok: false, error: "Not authenticated" };
    }

    // Checkbox convention — enrollment is driven by the form's presence of
    // the `enrolled` field at submit time. We set `enrolledAt` on flip-to-on
    // and leave it untouched on flip-to-off so repeat toggles preserve the
    // original enrollment history for auditing.
    const enrolled = formData.get("enrolled") === "on";

    const current = await prisma.member.findUnique({
      where: { id: session.user.id },
      select: { hurricaneProtectionActive: true, hurricaneProtectionEnrolledAt: true },
    });
    if (!current) return { ok: false, error: "Member not found" };

    await prisma.member.update({
      where: { id: session.user.id },
      data: {
        hurricaneProtectionActive: enrolled,
        hurricaneProtectionEnrolledAt:
          enrolled && !current.hurricaneProtectionEnrolledAt
            ? new Date()
            : current.hurricaneProtectionEnrolledAt,
      },
    });

    revalidatePath("/settings/hurricane");
    revalidatePath("/");
    return { ok: true, error: null };
  } catch (e) {
    logger.error("toggleHurricaneProtection failed", e, {
      action: "toggleHurricaneProtection",
    });
    return { ok: false, error: "Could not update enrollment. Try again." };
  }
}
