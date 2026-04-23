/**
 * Provenance bundle assembly for feature #40.
 *
 * Pulls the chain-of-custody record for a single bottle from existing tables
 * (no new schema): the certificate's monitoring window, the SensorReading
 * envelope over that window, every Alert against the certificate's locker
 * within the window, every LockerSlot placement that ever held the wine, and
 * any WineDisposition rows. The result is a single canonical object that the
 * UI, the JSON export, and the PDF export all consume.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { provenanceBundleHash } from "./certificate-hash";
import { toNumber } from "./utils";
import { getLockerEnvelope } from "./sensor-rollups";

export type ProvenanceEventKind =
  | "intake"
  | "placement"
  | "alert"
  | "certificate"
  | "disposition"
  | "current";

export interface ProvenanceEvent {
  kind: ProvenanceEventKind;
  date: string; // ISO
  title: string;
  detail?: string;
  severity?: "info" | "warning" | "critical";
}

export interface ProvenanceEnvelope {
  start: string; // ISO
  end: string; // ISO
  sampleCount: number;
  temp: { min: number; max: number; avg: number } | null;
  humidity: { min: number; max: number; avg: number } | null;
}

export interface ProvenanceBundle {
  schema: "caveau.provenance.v1";
  certificateId: string;
  certificateNumber: string;
  generatedAt: string;
  bottle: {
    id: string;
    name: string;
    vintage: number;
    producer: string;
    region: string;
    varietal: string;
  };
  locker: {
    id: string;
    lockerNumber: number;
    zone: string;
  };
  envelope: ProvenanceEnvelope;
  events: ProvenanceEvent[];
  signature: string;
}

/**
 * Build a provenance bundle for a certificate. Caller is responsible for
 * having already verified that the requesting member owns the certificate
 * (mirrors the pattern in `src/app/api/certificates/[id]/route.ts`).
 */
export async function buildProvenanceBundle(
  certificateId: string,
  memberId: string,
): Promise<ProvenanceBundle | null> {
  const cert = await prisma.provenanceCertificate.findFirst({
    where: { id: certificateId, wine: { memberId } },
    include: {
      wine: {
        select: {
          id: true,
          name: true,
          vintage: true,
          producer: true,
          region: true,
          varietal: true,
        },
      },
      locker: { select: { id: true, lockerNumber: true, zone: true } },
    },
  });
  if (!cert) return null;

  const start = cert.monitoringStart;
  const end = cert.monitoringEnd;

  const [envelopeStats, alerts, placements, dispositions] = await Promise.all([
    getLockerEnvelope(cert.lockerId, start, end),
    prisma.alert.findMany({
      where: {
        lockerId: cert.lockerId,
        timestamp: { gte: start, lte: end },
        // Provenance is the chain-of-custody surface investors and
        // buyers read; simulated alerts must never enter it.
        source: "device",
      },
      orderBy: { timestamp: "asc" },
      select: {
        id: true,
        type: true,
        severity: true,
        message: true,
        timestamp: true,
      },
    }),
    prisma.lockerSlot.findMany({
      where: { wineId: cert.wineId, dateStored: { not: null } },
      orderBy: { dateStored: "asc" },
      select: {
        slotPosition: true,
        dateStored: true,
        locker: { select: { lockerNumber: true, zone: true } },
      },
    }),
    prisma.wineDisposition.findMany({
      where: { wineId: cert.wineId },
      orderBy: { date: "asc" },
      select: {
        type: true,
        date: true,
        salePrice: true,
        recipient: true,
        notes: true,
      },
    }),
  ]);

  const envelope: ProvenanceEnvelope = {
    start: start.toISOString(),
    end: end.toISOString(),
    sampleCount: envelopeStats.sampleCount,
    temp: envelopeStats.temp ? {
      min: round(envelopeStats.temp.min),
      max: round(envelopeStats.temp.max),
      avg: round(envelopeStats.temp.avg),
    } : null,
    humidity: envelopeStats.humidity ? {
      min: round(envelopeStats.humidity.min),
      max: round(envelopeStats.humidity.max),
      avg: round(envelopeStats.humidity.avg),
    } : null,
  };

  const events: ProvenanceEvent[] = [];

  events.push({
    kind: "intake",
    date: start.toISOString(),
    title: "Bottle entered Caveau custody",
    detail: `Locker #${cert.locker.lockerNumber} · ${cert.locker.zone} Zone`,
  });

  for (const slot of placements) {
    if (!slot.dateStored) continue;
    events.push({
      kind: "placement",
      date: slot.dateStored.toISOString(),
      title: `Placed in Locker #${slot.locker.lockerNumber}, Slot ${slot.slotPosition}`,
      detail: `${slot.locker.zone} Zone`,
    });
  }

  for (const a of alerts) {
    events.push({
      kind: "alert",
      date: a.timestamp.toISOString(),
      title: `${capitalize(a.type)} alert`,
      detail: a.message,
      severity: a.severity,
    });
  }

  events.push({
    kind: "certificate",
    date: cert.createdAt.toISOString(),
    title: "Custody & Condition Report issued",
    detail: cert.certificateNumber,
  });

  for (const d of dispositions) {
    const parts: string[] = [];
    if (d.recipient) parts.push(d.recipient);
    if (d.salePrice) parts.push(`$${toNumber(d.salePrice).toLocaleString()}`);
    if (d.notes) parts.push(d.notes);
    events.push({
      kind: "disposition",
      date: d.date.toISOString(),
      title: `Bottle ${d.type}`,
      detail: parts.join(" · ") || undefined,
    });
  }

  // Anchor the timeline with a "today" marker when the bottle is still in
  // custody (no disposition recorded). It gives the certificate viewer a
  // clear "monitoring continues" close instead of the timeline trailing off.
  if (dispositions.length === 0) {
    events.push({
      kind: "current",
      date: new Date().toISOString(),
      title: "Custody continues",
      detail: "Sentinel monitoring active",
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const bundle: Omit<ProvenanceBundle, "signature"> = {
    schema: "caveau.provenance.v1",
    certificateId: cert.id,
    certificateNumber: cert.certificateNumber,
    generatedAt: new Date().toISOString(),
    bottle: cert.wine,
    locker: cert.locker,
    envelope,
    events,
  };

  return { ...bundle, signature: provenanceBundleHash(bundle) };
}

function round(value: Prisma.Decimal | number | null): number {
  if (value == null) return 0;
  return Math.round(toNumber(value) * 10) / 10;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
