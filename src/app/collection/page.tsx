import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import CollectionClient from "./collection-client";
import type { WineCardData } from "@/components/wine-card";

export const dynamic = "force-dynamic";

async function addWine(formData: FormData) {
  "use server";

  const name = formData.get("name") as string;
  const vintage = parseInt(formData.get("vintage") as string, 10);
  const region = formData.get("region") as string;
  const varietal = formData.get("varietal") as string;
  const producer = formData.get("producer") as string;
  const purchasePrice = parseFloat(formData.get("purchasePrice") as string);

  if (!name || !vintage || !region || !varietal || !producer || isNaN(purchasePrice)) {
    throw new Error("All fields are required");
  }

  // Find the demo member
  const member = await prisma.member.findFirst();

  await prisma.wine.create({
    data: {
      name,
      vintage,
      region,
      varietal,
      producer,
      purchasePrice,
      currentValue: purchasePrice, // new wine starts at purchase price
      memberId: member?.id ?? null,
    },
  });

  revalidatePath("/collection");
}

export default async function CollectionPage() {
  const wines = await prisma.wine.findMany({
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
