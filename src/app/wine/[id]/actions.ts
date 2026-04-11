"use server";

import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const VALID_TYPES = ["sold", "transferred", "consumed", "gifted", "removed"] as const;

export async function recordDisposition(formData: FormData) {
  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const wineId = formData.get("wineId") as string | null;
  const typeRaw = formData.get("type") as string | null;
  const dateRaw = formData.get("date") as string | null;
  const salePriceRaw = formData.get("salePrice") as string | null;
  const recipient = (formData.get("recipient") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!wineId) throw new Error("Wine ID is required");
  if (!typeRaw || !VALID_TYPES.includes(typeRaw as typeof VALID_TYPES[number])) {
    throw new Error("Invalid disposition type");
  }

  const type = typeRaw as typeof VALID_TYPES[number];

  const dateVal = dateRaw ? new Date(dateRaw) : new Date();
  if (isNaN(dateVal.getTime())) throw new Error("Invalid date");

  let salePrice: number | null = null;
  if (type === "sold" && salePriceRaw) {
    salePrice = parseFloat(salePriceRaw);
    if (isNaN(salePrice) || salePrice < 0 || salePrice > 10_000_000) {
      throw new Error("Invalid sale price");
    }
  }

  // Map disposition type to wine status
  const statusMap: Record<string, "sold" | "transferred" | "consumed" | "gifted" | "removed"> = {
    sold: "sold",
    transferred: "transferred",
    consumed: "consumed",
    gifted: "gifted",
    removed: "removed",
  };

  // Verify ownership and update atomically inside a transaction
  await prisma.$transaction(async (tx) => {
    const wine = await tx.wine.findUnique({
      where: { id: wineId, memberId: session.user.id },
      select: { id: true, status: true },
    });
    if (!wine) throw new Error("Wine not found");
    if (wine.status !== "in_cellar") throw new Error("Wine is already disposed");

    await tx.wineDisposition.create({
      data: {
        wineId,
        memberId: session.user.id,
        type,
        date: dateVal,
        salePrice,
        recipient,
        notes,
      },
    });

    await tx.wine.update({
      where: { id: wineId },
      data: { status: statusMap[type] },
    });
  });

  revalidatePath(`/wine/${wineId}`);
  revalidatePath("/collection");
  revalidatePath("/");
}
