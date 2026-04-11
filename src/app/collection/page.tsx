import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { toNumber } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import CollectionClient from "./collection-client";
import type { WineCardData } from "@/components/wine-card";

export const dynamic = "force-dynamic";

async function addWine(formData: FormData) {
  "use server";

  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const name = (formData.get("name") as string | null)?.trim();
  const vintageRaw = formData.get("vintage") as string | null;
  const region = (formData.get("region") as string | null)?.trim();
  const varietal = (formData.get("varietal") as string | null)?.trim();
  const producer = (formData.get("producer") as string | null)?.trim();
  const priceRaw = formData.get("purchasePrice") as string | null;

  const vintage = vintageRaw ? parseInt(vintageRaw, 10) : NaN;
  const purchasePrice = priceRaw ? parseFloat(priceRaw) : NaN;

  if (!name || name.length > 500 || !region || !varietal || !producer) {
    throw new Error("All fields are required");
  }
  if (isNaN(vintage) || vintage < 1800 || vintage > new Date().getFullYear() + 1) {
    throw new Error("Invalid vintage year");
  }
  if (isNaN(purchasePrice) || purchasePrice < 0 || purchasePrice > 10_000_000) {
    throw new Error("Invalid purchase price");
  }

  await prisma.wine.create({
    data: {
      name,
      vintage,
      region,
      varietal,
      producer,
      purchasePrice,
      currentValue: purchasePrice,
      memberId: session.user.id,
    },
  });

  revalidatePath("/collection");
}

export default async function CollectionPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const wines = await prisma.wine.findMany({
    where: { memberId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  // Serialize Prisma Decimals to plain numbers for the client
  const serializedWines: WineCardData[] = wines.map((w) => ({
    id: w.id,
    name: w.name,
    vintage: w.vintage,
    region: w.region,
    varietal: w.varietal,
    producer: w.producer,
    purchasePrice: toNumber(w.purchasePrice),
    currentValue: toNumber(w.currentValue),
    imageUrl: w.imageUrl,
    drinkWindowStart: w.drinkWindowStart,
    drinkWindowEnd: w.drinkWindowEnd,
  }));

  // Extract unique regions and varietals for filter dropdowns
  const regions = Array.from(new Set(wines.map((w) => w.region))).sort();
  const varietals = Array.from(new Set(wines.map((w) => w.varietal))).sort();
  const vintages = Array.from(new Set(wines.map((w) => w.vintage))).sort((a, b) => a - b);

  return (
    <CollectionClient
      wines={serializedWines}
      regions={regions}
      varietals={varietals}
      vintageRange={[vintages[0] ?? 2000, vintages[vintages.length - 1] ?? 2025]}
      addWineAction={addWine}
    />
  );
}
