"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { EmailSchema, UuidSchema } from "@/lib/schemas";

export interface InstallerFormState {
  submittedAt: number | null;
  ok: boolean;
  error: string | null;
  message: string | null;
}

async function requireAdminId(): Promise<string | null> {
  const session = await getServerAuth();
  if (!session?.user?.id) return null;
  if (session.user.role !== Role.admin) return null;
  return session.user.id;
}

const CreateInstallerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
  company: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(200, "Company too long").optional(),
    )
    .optional(),
  region: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(200, "Region too long").optional(),
    )
    .optional(),
  email: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      EmailSchema.optional(),
    )
    .optional(),
  phone: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined),
      z.string().max(60, "Phone too long").optional(),
    )
    .optional(),
});

export async function createInstaller(
  _prev: InstallerFormState,
  formData: FormData,
): Promise<InstallerFormState> {
  const now = Date.now();
  const adminId = await requireAdminId();
  if (!adminId) {
    return { submittedAt: now, ok: false, error: "Forbidden", message: null };
  }

  const parsed = CreateInstallerSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    region: formData.get("region"),
    email: formData.get("email"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return {
      submittedAt: now,
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      message: null,
    };
  }

  const { name, company, region, email, phone } = parsed.data;

  await prisma.homeCellarInstaller.create({
    data: {
      name,
      company: company ?? null,
      region: region ?? null,
      email: email ?? null,
      phone: phone ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/admin/installers");
  revalidatePath("/admin/facilities");
  revalidatePath("/admin/facilities/", "layout");
  return {
    submittedAt: now,
    ok: true,
    error: null,
    message: "Installer added.",
  };
}

export async function toggleInstallerActive(formData: FormData) {
  const adminId = await requireAdminId();
  if (!adminId) return;

  const installerId = formData.get("installerId");
  const active = formData.get("active");

  const idCheck = UuidSchema.safeParse(installerId);
  if (!idCheck.success) return;

  const nextActive =
    active === "true" || active === "1" || active === "on" ? true : false;

  await prisma.homeCellarInstaller.update({
    where: { id: idCheck.data },
    data: { active: nextActive },
    select: { id: true },
  });

  revalidatePath("/admin/installers");
  revalidatePath("/admin/facilities");
}
