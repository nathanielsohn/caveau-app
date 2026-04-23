/**
 * NFC bottle lookup + scan logging (feature #43).
 *
 * The public /bottle/[tagId] page resolves a tag serial to a lightweight
 * render-ready bundle — wine facts, current Liv-ex valuation, latest
 * Caveau Custody & Condition Report, and a Sentinel chain-of-custody summary.
 * Scans are logged opportunistically; a logging failure must never break
 * the public render path.
 *
 * Why the scan log is separate from `loadBottleByTag`:
 *   - Callers can short-circuit logging when the tag lookup 404s.
 *   - A logging exception (DB blip, stale connection) shouldn't take down
 *     an auction house's verification tap.
 *
 * IP hashing and truncation match the handoff helper so both "public
 * access log" features share a salting discipline. See `lib/handoff.ts`.
 */

import { createHash } from "crypto";
import { prisma } from "./prisma";
import { env } from "./env";
import { getPublicUrl } from "./s3";
import { toNumber } from "./utils";
import { getLockerEnvelope } from "./sensor-rollups";

/** URL-path format for a tag serial. Keep this in sync with
 *  `TagIdSchema` in `app/wine/[id]/nfc-actions.ts` — they guard the same
 *  field from two different directions (intake write vs. public read). */
export const TAG_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

export interface BottleBundle {
  tag: {
    /** Internal row ID — used to log scans without a second DB round-trip. */
    id: string;
    tagId: string;
    tier: "capsule" | "collar";
    activatedAt: string | null;
    scanCount: number;
  };
  wine: {
    id: string;
    name: string;
    vintage: number;
    producer: string;
    region: string;
    varietal: string;
    photoUrl: string | null;
  };
  owner: {
    name: string;
  };
  livex: {
    price: number;
    date: string;
    source: string;
  } | null;
  certificate: {
    id: string;
    certificateNumber: string;
    monitoringStart: string;
    monitoringEnd: string;
    createdAt: string;
  } | null;
  custody: {
    tempMean: number | null;
    tempMin: number | null;
    tempMax: number | null;
    humidityMean: number | null;
    sampleCount: number;
  } | null;
  disposed: boolean;
}

/**
 * Resolve a tag serial to a render-ready bundle. Returns null when the
 * tag doesn't exist — the page surface a "not found" state without any
 * DB writes in that case.
 */
export async function loadBottleByTag(tagId: string): Promise<BottleBundle | null> {
  const tag = await prisma.nfcTag.findUnique({
    where: { tagId },
    include: {
      wine: {
        select: {
          id: true,
          name: true,
          vintage: true,
          producer: true,
          region: true,
          varietal: true,
          imageKey: true,
          status: true,
          member: { select: { name: true } },
        },
      },
      _count: { select: { scans: true } },
    },
  });
  if (!tag) return null;

  // Pull the latest certificate + latest Liv-ex valuation in parallel.
  // Certificates are the anchor for the Sentinel envelope (temp/humidity
  // means), which is what makes the public landing page credible to a
  // prospective buyer.
  const [livex, certificate] = await Promise.all([
    prisma.wineValuation.findFirst({
      where: { wineId: tag.wineId, source: "liv-ex" },
      orderBy: { date: "desc" },
      select: { price: true, date: true, source: true },
    }),
    prisma.provenanceCertificate.findFirst({
      where: { wineId: tag.wineId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        certificateNumber: true,
        monitoringStart: true,
        monitoringEnd: true,
        createdAt: true,
        tempMean: true,
        tempMin: true,
        tempMax: true,
        humidityMean: true,
        lockerId: true,
      },
    }),
  ]);

  // Sample count is a meaningful signal ("unbroken X,000-point record")
  // but we only need it when a certificate exists; no certificate means
  // no custody summary to show.
  let sampleCount = 0;
  if (certificate) {
    const envelope = await getLockerEnvelope(
      certificate.lockerId,
      certificate.monitoringStart,
      certificate.monitoringEnd,
    );
    sampleCount = envelope.sampleCount;
  }

  return {
    tag: {
      id: tag.id,
      tagId: tag.tagId,
      tier: tag.tier,
      activatedAt: tag.activatedAt ? tag.activatedAt.toISOString() : null,
      scanCount: tag._count.scans,
    },
    wine: {
      id: tag.wine.id,
      name: tag.wine.name,
      vintage: tag.wine.vintage,
      producer: tag.wine.producer,
      region: tag.wine.region,
      varietal: tag.wine.varietal,
      photoUrl: getPublicUrl(tag.wine.imageKey),
    },
    owner: { name: tag.wine.member.name },
    livex: livex
      ? {
          price: toNumber(livex.price),
          date: livex.date.toISOString(),
          source: livex.source,
        }
      : null,
    certificate: certificate
      ? {
          id: certificate.id,
          certificateNumber: certificate.certificateNumber,
          monitoringStart: certificate.monitoringStart.toISOString(),
          monitoringEnd: certificate.monitoringEnd.toISOString(),
          createdAt: certificate.createdAt.toISOString(),
        }
      : null,
    custody: certificate
      ? {
          tempMean: certificate.tempMean ? toNumber(certificate.tempMean) : null,
          tempMin: certificate.tempMin ? toNumber(certificate.tempMin) : null,
          tempMax: certificate.tempMax ? toNumber(certificate.tempMax) : null,
          humidityMean: certificate.humidityMean
            ? toNumber(certificate.humidityMean)
            : null,
          sampleCount,
        }
      : null,
    disposed: tag.wine.status !== "in_cellar",
  };
}

/** SHA-256(ip + secret). Matches the handoff helper — a deliberate
 *  cross-feature shared discipline so both public access logs use the
 *  same salting scheme. */
function hashIp(ip: string): string {
  const salt = env.CERTIFICATE_HMAC_SECRET || "caveau-nfc-fallback-salt";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

/**
 * Fire-and-forget scan log. Never throws — a logging failure must not
 * break the public page. Caller should provide the concrete NfcTag row id
 * (not the tag serial) to avoid a second DB round-trip.
 */
export async function recordNfcScan(
  nfcTagId: string,
  ip: string,
  userAgent: string | null,
): Promise<void> {
  try {
    await prisma.nfcScan.create({
      data: {
        nfcTagId,
        ipHash: hashIp(ip),
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      },
    });
  } catch (err) {
    console.error("[nfc] failed to log scan:", err);
  }
}
