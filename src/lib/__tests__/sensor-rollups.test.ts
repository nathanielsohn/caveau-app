import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    sensorReading: {
      aggregate: vi.fn(),
    },
  },
}));

import { prisma } from "../prisma";
import { getLockerEnvelope } from "../sensor-rollups";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLockerEnvelope", () => {
  it("uses half-open hourly rollups for exact hour windows", async () => {
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        sample_count: 12,
        temp_min: 54,
        temp_max: 56,
        temp_avg: 55,
        humidity_min: 60,
        humidity_max: 64,
        humidity_avg: 62,
      },
    ]);

    const result = await getLockerEnvelope(
      "locker-1",
      new Date("2026-04-28T10:00:00.000Z"),
      new Date("2026-04-28T11:00:00.000Z"),
    );

    const queryStrings = String(
      (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]![0],
    );
    expect(queryStrings).toContain('r."bucket" <');
    expect(prisma.sensorReading.aggregate).not.toHaveBeenCalled();
    expect(result.sampleCount).toBe(12);
  });

  it("falls back to raw readings for partial-hour custody windows", async () => {
    (prisma.sensorReading.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min: { temperature: 54, humidity: 60 },
      _max: { temperature: 56, humidity: 64 },
      _avg: { temperature: 55, humidity: 62 },
      _count: { _all: 3 },
    });

    const start = new Date("2026-04-28T10:15:00.000Z");
    const end = new Date("2026-04-28T10:45:00.000Z");
    const result = await getLockerEnvelope("locker-1", start, end);

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.sensorReading.aggregate).toHaveBeenCalledWith({
      where: { lockerId: "locker-1", timestamp: { gte: start, lte: end } },
      _min: { temperature: true, humidity: true },
      _max: { temperature: true, humidity: true },
      _avg: { temperature: true, humidity: true },
      _count: { _all: true },
    });
    expect(result.sampleCount).toBe(3);
  });
});
