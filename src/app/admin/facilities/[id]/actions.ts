"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";

async function requireAdmin(): Promise<boolean> {
  const session = await getServerAuth();
  return Boolean(session?.user?.id && session.user.role === Role.admin);
}

export async function setLocationInstaller(formData: FormData) {
  if (!(await requireAdmin())) return;

  const facilityId = formData.get("facilityId");
  const installerIdRaw = formData.get("installerId");

  const facilityCheck = UuidSchema.safeParse(facilityId);
  if (!facilityCheck.success) return;

  const installerId =
    typeof installerIdRaw === "string" && installerIdRaw.trim().length > 0
      ? installerIdRaw.trim()
      : null;

  if (installerId) {
    const installerCheck = UuidSchema.safeParse(installerId);
    if (!installerCheck.success) return;
  }

  await prisma.facility.updateMany({
    where: { id: facilityCheck.data, type: "private_location" },
    data: { locationInstallerId: installerId },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${facilityCheck.data}`);
  revalidatePath("/admin/installers");
}

export async function setPrivateLocationCertification(formData: FormData) {
  if (!(await requireAdmin())) return;

  const facilityId = formData.get("facilityId");
  const certifiedRaw = formData.get("certified");

  const facilityCheck = UuidSchema.safeParse(facilityId);
  if (!facilityCheck.success) return;

  const certified =
    certifiedRaw === "true" || certifiedRaw === "1" || certifiedRaw === "on";

  await prisma.facility.updateMany({
    where: { id: facilityCheck.data, type: "private_location" },
    data: { privateLocationCertifiedAt: certified ? new Date() : null },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/facilities");
  revalidatePath(`/admin/facilities/${facilityCheck.data}`);
}
