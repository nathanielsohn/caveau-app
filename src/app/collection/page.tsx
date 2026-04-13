import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { getCurrentFacility } from "@/lib/current-facility";
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

  const memberId = session.user.id;
  const facility = await getCurrentFacility(memberId);

  // Scope wines to the active facility: include wines whose slot lives in
  // this facility, plus unassigned wines (not yet in any slot) — those are
  // member-owned so we show them regardless of the current facility.
  const wines = await prisma.wine.findMany({
    where: {
      memberId,
      ...(facility
        ? {
            OR: [
              { lockerSlots: { none: {} } },
              { lockerSlots: { some: { locker: { facilityId: facility.id } } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      vintage: true,
      region: true,
      varietal: true,
      producer: true,
      purchasePrice: true,
      currentValue: true,
      imageKey: true,
      drinkWindowStart: true,
      drinkWindowEnd: true,
      status: true,
      createdAt: true,
      lockerSlots: {
        select: {
          locker: {
            select: { id: true, lockerNumber: true, facilityId: true },
          },
        },
      },
    },
  });

  // Pick the locker assignment that belongs to the current facility so the
  // client can both display and filter by locker number.
  const serializedWines: WineCardData[] = wines.map((w) => {
    const slot = facility
      ? w.lockerSlots.find((s) => s.locker.facilityId === facility.id)
      : w.lockerSlots[0];
    return {
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
      lockerId: slot?.locker.id ?? null,
      lockerNumber: slot?.locker.lockerNumber ?? null,
    };
  });

  // Build the locker dropdown from whichever lockers in the active facility
  // currently hold at least one of this member's wines.
  const lockerMap = new Map<string, number>();
  for (const w of serializedWines) {
    if (w.lockerId && w.lockerNumber != null) {
      lockerMap.set(w.lockerId, w.lockerNumber);
    }
  }
  const lockerOptions = Array.from(lockerMap, ([id, lockerNumber]) => ({
    id,
    lockerNumber,
  })).sort((a, b) => a.lockerNumber - b.lockerNumber);

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
      lockerOptions={lockerOptions}
      vintageRange={[vintages[0] ?? 2000, vintages[vintages.length - 1] ?? 2025]}
      addWineAction={addWine}
    />
  );
}
