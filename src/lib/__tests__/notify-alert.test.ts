/**
 * Unit tests for the alert notification pipeline (feature #19).
 *
 * Mocks prisma + the SES wrapper so we can assert the exact gating
 * decisions notify-alert makes without touching AWS or the database.
 * The five cases below mirror the gating order inside `notifyAlert`:
 * idempotency → opt-in → severity floor → cooldown → send.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    alert: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendAlertEmail: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendAlertEmail } from "@/lib/email";
import { notifyAlert } from "../notify-alert";

type Mock = ReturnType<typeof vi.fn>;

const ALERT_ID = "alert-under-test";
const LOCKER_ID = "locker-1";

interface TestMember {
  id: string;
  name: string;
  email: string | null;
  emailAlertsEnabled: boolean;
  emailAlertSeverity: "info" | "warning" | "critical";
  emailAlertCooldownMin: number;
}

interface TestAlertOverrides {
  severity?: "info" | "warning" | "critical";
  notifiedAt?: Date | null;
  member?: Partial<TestMember>;
}

function makeAlert(overrides: TestAlertOverrides = {}) {
  const member: TestMember = {
    id: "member-1",
    name: "Robert Saenz",
    email: "robert@example.com",
    emailAlertsEnabled: true,
    emailAlertSeverity: "warning",
    emailAlertCooldownMin: 30,
    ...(overrides.member ?? {}),
  };
  return {
    id: ALERT_ID,
    lockerId: LOCKER_ID,
    type: "temperature",
    severity: overrides.severity ?? "warning",
    message: "Temperature crossed 60°F",
    timestamp: new Date("2026-04-16T12:00:00Z"),
    notifiedAt: overrides.notifiedAt ?? null,
    locker: {
      id: LOCKER_ID,
      lockerNumber: 7,
      zone: "Zone A",
      member,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (sendAlertEmail as Mock).mockResolvedValue(true);
  (prisma.alert.update as Mock).mockResolvedValue({});
});

describe("notifyAlert", () => {
  it("skips when the alert was already notified (idempotent)", async () => {
    (prisma.alert.findUnique as Mock).mockResolvedValue(
      makeAlert({ notifiedAt: new Date("2026-04-16T11:00:00Z") }),
    );

    await notifyAlert(ALERT_ID);

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("skips when the member opted out of email alerts", async () => {
    (prisma.alert.findUnique as Mock).mockResolvedValue(
      makeAlert({ member: { emailAlertsEnabled: false } }),
    );

    await notifyAlert(ALERT_ID);

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("skips when the alert severity is below the member's threshold", async () => {
    (prisma.alert.findUnique as Mock).mockResolvedValue(
      makeAlert({
        severity: "info",
        member: { emailAlertSeverity: "warning" },
      }),
    );

    await notifyAlert(ALERT_ID);

    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("skips when a prior notification is inside the cooldown window", async () => {
    (prisma.alert.findUnique as Mock).mockResolvedValue(makeAlert());
    // The cooldown probe finds a recent sibling notification on the same
    // (locker, type) — this is the signal to suppress the duplicate.
    (prisma.alert.findFirst as Mock).mockResolvedValue({ id: "earlier-alert" });

    await notifyAlert(ALERT_ID);

    expect(prisma.alert.findFirst).toHaveBeenCalledTimes(1);
    const whereArg = (prisma.alert.findFirst as Mock).mock.calls[0][0].where;
    expect(whereArg.lockerId).toBe(LOCKER_ID);
    expect(whereArg.type).toBe("temperature");
    expect(whereArg.notifiedAt).toEqual({ gte: expect.any(Date) });
    expect(whereArg.NOT).toEqual({ id: ALERT_ID });
    expect(sendAlertEmail).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("sends and stamps notifiedAt when cooldown has expired", async () => {
    (prisma.alert.findUnique as Mock).mockResolvedValue(makeAlert());
    (prisma.alert.findFirst as Mock).mockResolvedValue(null);

    await notifyAlert(ALERT_ID);

    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    const [recipient, payload] = (sendAlertEmail as Mock).mock.calls[0];
    expect(recipient).toEqual({
      name: "Robert Saenz",
      email: "robert@example.com",
    });
    expect(payload).toMatchObject({
      severity: "warning",
      type: "temperature",
      lockerNumber: 7,
      lockerZone: "Zone A",
    });
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: { notifiedAt: expect.any(Date) },
    });
  });
});
