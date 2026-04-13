import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { toNumber } from "@/lib/utils";
import { getPublicUrl } from "@/lib/s3";
import { revalidatePath } from "next/cache";
import { CreateWineBodySchema, parseOr400 } from "@/lib/schemas";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import CollectionClient from "./collection-client";
import type { WineCardData } from "@/components/wine-card";

export const dynamic = "force-dynamic";

async function addWine(formData: FormData) {
  "use server";

  const session = await getServerAuth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  const ip = clientIp(headers());
  const limit = await checkRateLimit(`wine-create:${session.user.id}:${ip}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.allowed) throw new Error("Too many requests");

  const parsed = parseOr400(CreateWineBodySchema, {
    name: formData.get("name"),
    vintage: formData.get("vintage"),
    region: formData.get("region"),
    varietal: formData.get("varietal"),
    producer: formData.get("producer"),
    purchasePrice: formData.get("purchasePrice"),
  });
  if (!parsed.ok) throw new Error("Invalid wine data");

  await prisma.wine.create({
    data: {
      ...parsed.data,
      currentValue: parsed.data.purchasePrice,
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
    take: 500,
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
    photoUrl: getPublicUrl(w.imageKey),
    drinkWindowStart: w.drinkWindowStart,
    drinkWindowEnd: w.drinkWindowEnd,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
  }));

  // Extract unique regions, varietals, producers for filter dropdowns
  const regions = Array.from(new Set(wines.map((w) => w.region))).sort();
  const varietals = Array.from(new Set(wines.map((w) => w.varietal))).sort();
  const producers = Array.from(new Set(wines.map((w) => w.producer))).sort();
  const vintages = Array.from(new Set(wines.map((w) => w.vintage))).sort((a, b) => a - b);

  return (
    <CollectionClient
      wines={serializedWines}
      regions={regions}
      varietals={varietals}
      producers={producers}
      vintageRange={[vintages[0] ?? 2000, vintages[vintages.length - 1] ?? 2025]}
      addWineAction={addWine}
    />
  );
}
