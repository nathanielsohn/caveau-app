import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { getCurrentFacility } from "@/lib/current-facility";
import { toNumber } from "@/lib/utils";
import { getPublicUrl, isS3Configured } from "@/lib/s3";
import { isVisionConfigured } from "@/lib/vision";
import { revalidatePath } from "next/cache";
import { CreateWineBodySchema, parseOr400 } from "@/lib/schemas";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  requestScanUploadUrl,
  scanWineLabel,
} from "./label-scan-actions";
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
    imageKey: formData.get("imageKey"),
  });
  if (!parsed.ok) throw new Error("Invalid wine data");

  // Defense-in-depth: an attacker could submit any string as imageKey.
  // Only accept keys under the caller's own member prefix.
  const { imageKey, ...wineData } = parsed.data;
  const safeImageKey =
    imageKey && imageKey.startsWith(`wines/${session.user.id}/`)
      ? imageKey
      : null;

  await prisma.wine.create({
    data: {
      ...wineData,
      currentValue: wineData.purchasePrice,
      memberId: session.user.id,
      ...(safeImageKey ? { imageKey: safeImageKey } : {}),
    },
  });

  revalidatePath("/collection");
}

export default async function CollectionPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const memberId = session.user.id;
  const facility = await getCurrentFacility(memberId);

  const wineSelect = {
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
  } as const;

  // Scope wines to the active facility. We split the OR query that used to
  // live here into two parallel queries so Postgres can use the
  // (memberId, status) index on each branch instead of falling back to a
  // sequential scan on the negation:
  //   1) assigned wines whose slot lives in this facility
  //   2) unassigned wines (not in any slot) — member-owned, shown everywhere
  // The facility-less case still runs one wide query.
  const wines = await (async () => {
    if (!facility) {
      return prisma.wine.findMany({
        where: { memberId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: wineSelect,
      });
    }
    const [assigned, unassigned] = await Promise.all([
      prisma.wine.findMany({
        where: {
          memberId,
          lockerSlots: { some: { locker: { facilityId: facility.id } } },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: wineSelect,
      }),
      prisma.wine.findMany({
        where: { memberId, lockerSlots: { none: {} } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: wineSelect,
      }),
    ]);
    const seen = new Set<string>();
    return [...assigned, ...unassigned]
      .filter((w) => (seen.has(w.id) ? false : (seen.add(w.id), true)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 500);
  })();

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
      s3Configured={isS3Configured()}
      visionConfigured={isVisionConfigured()}
      requestScanUploadUrlAction={requestScanUploadUrl}
      scanWineLabelAction={scanWineLabel}
    />
  );
}
