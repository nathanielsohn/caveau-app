/**
 * Handoff package assembly for feature #41.
 *
 * A handoff package is a shareable bundle of everything an auction house or
 * broker needs to validate a bottle: the Caveau Custody & Condition Report, the full
 * Sentinel environmental envelope (reused from #40), the current Liv-ex
 * valuation, and the wine photo. The recipient opens the bundle via a
 * random share token; each view is logged to `HandoffAccess`.
 */

import { createHash, randomBytes } from "crypto";
import type { HandoffChannel } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { getPublicUrl } from "./s3";
import { buildProvenanceBundle, type ProvenanceBundle } from "./provenance";
import { toNumber } from "./utils";

/** URL-safe ~32-char random token. 192 bits of entropy is plenty of headroom
 *  against token-guessing even if we issue millions of packages. */
export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/** SHA-256 of (ip + salt). Salt is the certificate HMAC secret so access logs
 *  can't be cross-referenced against other services that might hash IPs. */
export function hashIp(ip: string): string {
  const salt = env.CERTIFICATE_HMAC_SECRET || "caveau-handoff-fallback-salt";
  return createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

export interface HandoffBundle {
  package: {
    id: string;
    shareToken: string;
    recipientName: string;
    recipientEmail: string;
    channel: HandoffChannel;
    createdAt: string;
    expiresAt: string | null;
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
  } | null;
  provenance: ProvenanceBundle | null;
  /** Expiry check pre-computed so the render path doesn't duplicate the
   *  timezone-aware comparison. */
  expired: boolean;
}

/**
 * Build the public-facing bundle for a handoff token. Returns null when the
 * token doesn't match a package. Callers should log access separately via
 * `recordHandoffAccess` so a failed lookup isn't logged as a valid view.
 */
export async function loadHandoffBundle(
  shareToken: string,
): Promise<HandoffBundle | null> {
  const pkg = await prisma.handoffPackage.findUnique({
    where: { shareToken },
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
          memberId: true,
        },
      },
      member: { select: { name: true } },
    },
  });
  if (!pkg) return null;

  // Most recent Custody & Condition Report for the bottle. We pick at view time
  // (rather than storing certificateId on the package) so the bundle always
  // reflects the freshest custody record — a new report issued after the
  // package was created should still show up.
  const cert = await prisma.provenanceCertificate.findFirst({
    where: { wineId: pkg.wineId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const [provenance, livex] = await Promise.all([
    cert
      ? buildProvenanceBundle(cert.id, pkg.wine.memberId)
      : Promise.resolve(null),
    prisma.wineValuation.findFirst({
      where: { wineId: pkg.wineId, source: "liv-ex" },
      orderBy: { date: "desc" },
      select: { price: true, date: true },
    }),
  ]);

  const expired = pkg.expiresAt != null && pkg.expiresAt.getTime() < Date.now();

  return {
    package: {
      id: pkg.id,
      shareToken: pkg.shareToken,
      recipientName: pkg.recipientName,
      recipientEmail: pkg.recipientEmail,
      channel: pkg.channel,
      createdAt: pkg.createdAt.toISOString(),
      expiresAt: pkg.expiresAt ? pkg.expiresAt.toISOString() : null,
    },
    wine: {
      id: pkg.wine.id,
      name: pkg.wine.name,
      vintage: pkg.wine.vintage,
      producer: pkg.wine.producer,
      region: pkg.wine.region,
      varietal: pkg.wine.varietal,
      photoUrl: getPublicUrl(pkg.wine.imageKey),
    },
    owner: { name: pkg.member.name },
    livex: livex
      ? { price: toNumber(livex.price), date: livex.date.toISOString() }
      : null,
    provenance,
    expired,
  };
}

/**
 * Fire-and-forget log of a bundle view. Never throws — a logging failure
 * must not break the public render path. Truncates the user-agent string so
 * a hostile client can't blow up the DB row size.
 */
export async function recordHandoffAccess(
  packageId: string,
  ip: string,
  userAgent: string | null,
): Promise<void> {
  try {
    await prisma.handoffAccess.create({
      data: {
        packageId,
        ipHash: hashIp(ip),
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      },
    });
  } catch (err) {
    console.error("[handoff] failed to log access:", err);
  }
}
