"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SentinelEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { parseOr400 } from "@/lib/schemas";

/**
 * Admin actions for the Sentinel fleet (feature #58). Each one re-checks
 * `role=admin` — the layout already gates /admin but server actions can
 * be POSTed directly, so don't trust the layout for authorization.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const session = await getServerAuth();
  if (session?.user?.role !== "admin" || !session.user.id) return null;
  return session.user.id;
}

const ReassignSchema = z.object({
  deviceId: z.string().uuid(),
  lockerId: z
    .string()
    .uuid()
    .nullable()
    .or(z.literal("").transform(() => null)),
  memberId: z
    .string()
    .uuid()
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export async function reassignDeviceAction(
  input: z.input<typeof ReassignSchema>,
): Promise<ActionResult> {
  const actorId = await requireAdmin();
  if (!actorId) return { ok: false, error: "Forbidden" };

  const parsed = ReassignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { deviceId, lockerId, memberId } = parsed.data;

  const device = await prisma.sentinelDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, facilityId: true, lockerId: true, memberId: true },
  });
  if (!device) return { ok: false, error: "Device not found" };

  // Keep cross-facility assignment from sneaking in: if a locker is
  // specified, confirm it's at the device's facility. Same for member.
  if (lockerId) {
    const locker = await prisma.locker.findUnique({
      where: { id: lockerId },
      select: { facilityId: true },
    });
    if (!locker || locker.facilityId !== device.facilityId) {
      return { ok: false, error: "Locker is at a different facility" };
    }
  }
  if (memberId) {
    const membership = await prisma.facilityMember.findUnique({
      where: {
        memberId_facilityId: { memberId, facilityId: device.facilityId },
      },
    });
    if (!membership) {
      return { ok: false, error: "Member is not enrolled at this facility" };
    }
  }

  await prisma.$transaction([
    prisma.sentinelDevice.update({
      where: { id: deviceId },
      data: {
        lockerId,
        memberId,
        installedAt:
          lockerId || memberId
            ? (device.lockerId || device.memberId ? undefined : new Date())
            : undefined,
      },
    }),
    prisma.sentinelDeviceEvent.create({
      data: {
        deviceId,
        type: SentinelEventType.reassigned,
        actorMemberId: actorId,
        payload: {
          from: { lockerId: device.lockerId, memberId: device.memberId },
          to: { lockerId, memberId },
        },
      },
    }),
  ]);

  revalidatePath("/admin/sentinels");
  revalidatePath(`/admin/sentinels/${deviceId}`);
  return { ok: true };
}

const FirmwareSchema = z.object({
  deviceId: z.string().uuid(),
  version: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z.\-_+]+$/, "Invalid firmware version"),
});

export async function markFirmwareUpdatedAction(
  input: z.input<typeof FirmwareSchema>,
): Promise<ActionResult> {
  const actorId = await requireAdmin();
  if (!actorId) return { ok: false, error: "Forbidden" };

  const parsed = parseOr400(FirmwareSchema, input);
  if (!parsed.ok) return { ok: false, error: "Invalid input" };
  const { deviceId, version } = parsed.data;

  const device = await prisma.sentinelDevice.findUnique({
    where: { id: deviceId },
    select: { firmwareVersion: true },
  });
  if (!device) return { ok: false, error: "Device not found" };
  if (device.firmwareVersion === version) {
    return { ok: false, error: "Already on that firmware" };
  }

  await prisma.$transaction([
    prisma.sentinelDevice.update({
      where: { id: deviceId },
      data: { firmwareVersion: version },
    }),
    prisma.sentinelDeviceEvent.create({
      data: {
        deviceId,
        type: SentinelEventType.firmware_updated,
        actorMemberId: actorId,
        payload: { from: device.firmwareVersion, to: version },
      },
    }),
  ]);

  revalidatePath("/admin/sentinels");
  revalidatePath(`/admin/sentinels/${deviceId}`);
  return { ok: true };
}

const DeviceIdSchema = z.object({ deviceId: z.string().uuid() });

export async function retireDeviceAction(
  input: { deviceId: string },
): Promise<ActionResult> {
  const actorId = await requireAdmin();
  if (!actorId) return { ok: false, error: "Forbidden" };

  const parsed = DeviceIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { deviceId } = parsed.data;

  const device = await prisma.sentinelDevice.findUnique({
    where: { id: deviceId },
    select: { retiredAt: true },
  });
  if (!device) return { ok: false, error: "Device not found" };
  if (device.retiredAt) return { ok: false, error: "Already retired" };

  await prisma.$transaction([
    prisma.sentinelDevice.update({
      where: { id: deviceId },
      data: {
        retiredAt: new Date(),
        lockerId: null,
        memberId: null,
        connectivity: "offline",
      },
    }),
    prisma.sentinelDeviceEvent.create({
      data: {
        deviceId,
        type: SentinelEventType.retired,
        actorMemberId: actorId,
      },
    }),
  ]);

  revalidatePath("/admin/sentinels");
  revalidatePath(`/admin/sentinels/${deviceId}`);
  return { ok: true };
}

export async function testPingDeviceAction(
  input: { deviceId: string },
): Promise<ActionResult> {
  const actorId = await requireAdmin();
  if (!actorId) return { ok: false, error: "Forbidden" };

  const parsed = DeviceIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { deviceId } = parsed.data;

  const device = await prisma.sentinelDevice.findUnique({
    where: { id: deviceId },
    select: { retiredAt: true },
  });
  if (!device) return { ok: false, error: "Device not found" };
  if (device.retiredAt) return { ok: false, error: "Device is retired" };

  // Demo theater — no real round-trip. Bumps the heartbeat so the fleet
  // view updates and writes an audit event so the detail page reflects
  // the action. A real Sentinel ping lands via the /api/ingest/sensor
  // pipeline and does the same update through the normal code path.
  const now = new Date();
  await prisma.$transaction([
    prisma.sentinelDevice.update({
      where: { id: deviceId },
      data: { lastHeartbeatAt: now },
    }),
    prisma.sentinelDeviceEvent.create({
      data: {
        deviceId,
        type: SentinelEventType.test_ping,
        actorMemberId: actorId,
        payload: { at: now.toISOString() },
      },
    }),
  ]);

  revalidatePath("/admin/sentinels");
  revalidatePath(`/admin/sentinels/${deviceId}`);
  return { ok: true };
}
