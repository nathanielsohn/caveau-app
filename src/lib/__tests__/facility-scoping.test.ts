/**
 * Regression tests for the audit-class "missing facilityId scoping" bug.
 *
 * Splits into two halves:
 *
 *   1. Runtime mocks for everything the test environment can compile —
 *      `recordLiveAlert` and `fetchSentinelData` from
 *      src/app/sentinel/actions.ts. We mock prisma + facility + auth
 *      and assert the locker lookup carries facilityId. If a refactor
 *      drops the filter, the assertions fail.
 *
 *   2. Source-code assertion for `getLockers` in src/app/locker/page.tsx
 *      because the file is JSX and our vitest config has no React plugin.
 *      Static check, but it catches deletion of the filter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    locker: { findFirst: vi.fn() },
    sensorReading: { findMany: vi.fn().mockResolvedValue([]) },
    alert: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "alert-id" }),
    },
  },
}));

vi.mock("@/lib/current-facility", () => ({
  requireMemberFacility: vi.fn().mockResolvedValue({
    memberId: "member-1",
    facilityId: "facility-7",
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 12, resetAt: 0 }),
  clientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/notify-alert", () => ({
  notifyAlert: vi.fn(),
}));

// `unstable_cache` wraps the inner fetch closure; in tests we just want
// the wrapper to pass calls through so prisma sees the real arguments.
vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
}));

import { prisma } from "@/lib/prisma";
import { recordLiveAlert, fetchSentinelData } from "@/app/sentinel/actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sentinel actions facility scoping", () => {
  it("recordLiveAlert looks up the member's locker filtered by facilityId", async () => {
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "locker-x",
    });
    await recordLiveAlert({
      type: "temperature",
      severity: "warning",
      message: "high",
    });
    expect(prisma.locker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: "member-1",
          facilityId: "facility-7",
        }),
      }),
    );
  });

  it("recordLiveAlert short-circuits to null when the member has no locker in the active facility", async () => {
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await recordLiveAlert({
      type: "temperature",
      severity: "warning",
      message: "high",
    });
    expect(result).toBeNull();
    expect(prisma.alert.create).not.toHaveBeenCalled();
  });

  it("fetchSentinelData looks up the locker filtered by facilityId", async () => {
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "locker-x",
    });
    await fetchSentinelData(24);
    expect(prisma.locker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          memberId: "member-1",
          facilityId: "facility-7",
        }),
      }),
    );
  });

  it("fetchSentinelData scopes the sensor query to the resolved locker (not all member lockers)", async () => {
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "locker-x",
    });
    await fetchSentinelData(1);
    expect(prisma.sensorReading.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockerId: "locker-x" }),
      }),
    );
  });

  it("fetchSentinelData returns empty data without querying when no facility locker is found", async () => {
    (prisma.locker.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await fetchSentinelData(24);
    expect(result).toEqual({ readings: [], alerts: [] });
    expect(prisma.sensorReading.findMany).not.toHaveBeenCalled();
  });
});

// ── Source-code assertion for the JSX page ──────────────────────────────

const LOCKER_PAGE_PATH = resolve(__dirname, "../../app/locker/page.tsx");

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

function functionBody(source: string, fnName: string): string {
  const match = source.match(new RegExp(`function\\s+${fnName}\\b`));
  if (!match || match.index == null) {
    throw new Error(`function ${fnName} not found in source`);
  }
  const start = source.indexOf("{", match.index);
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${fnName}`);
}

describe("getLockers (locker page) facility scoping", () => {
  const body = functionBody(readSource(LOCKER_PAGE_PATH), "getLockers");

  it("requires both memberId and facilityId in the where clause", () => {
    expect(body).toMatch(/memberId/);
    expect(body).toMatch(/facilityId/);
  });

  it("uses prisma.locker.findMany (sanity check we sliced the right helper)", () => {
    expect(body).toMatch(/prisma\.locker\.findMany/);
  });
});
