import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  toNumber,
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatTemp,
  formatHumidity,
  formatVibration,
  formatLight,
  formatRelativeTime,
  formatDate,
  percentChange,
} from "../utils";

// ── toNumber ────────────────────────────────────────────────────────────

describe("toNumber", () => {
  it("returns 0 for null", () => {
    expect(toNumber(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(toNumber(undefined)).toBe(0);
  });

  it("passes through plain numbers", () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-5.5)).toBe(-5.5);
  });

  it("parses valid numeric strings", () => {
    expect(toNumber("100")).toBe(100);
    expect(toNumber("55.5")).toBe(55.5);
    expect(toNumber("-10")).toBe(-10);
  });

  it("returns 0 for non-numeric strings", () => {
    expect(toNumber("abc")).toBe(0);
    expect(toNumber("")).toBe(0);
  });

  it("handles Prisma Decimal-like objects via Number()", () => {
    // Prisma Decimal objects implement valueOf/toString
    const decimalLike = {
      toString: () => "123.45",
      valueOf: () => 123.45,
      [Symbol.toPrimitive]: () => 123.45,
    };
    expect(toNumber(decimalLike as unknown as number)).toBe(123.45);
  });
});

// ── formatCurrency ──────────────────────────────────────────────────────

describe("formatCurrency", () => {
  it("formats a number as USD", () => {
    expect(formatCurrency(4800)).toBe("$4,800.00");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles null/undefined gracefully", () => {
    expect(formatCurrency(null)).toBe("$0.00");
    expect(formatCurrency(undefined)).toBe("$0.00");
  });

  it("formats string values", () => {
    expect(formatCurrency("1250.50")).toBe("$1,250.50");
  });

  it("formats large numbers with commas", () => {
    expect(formatCurrency(25800)).toBe("$25,800.00");
  });
});

// ── formatCurrencyCompact ───────────────────────────────────────────────

describe("formatCurrencyCompact", () => {
  it("formats thousands compactly", () => {
    const result = formatCurrencyCompact(4800);
    expect(result).toMatch(/\$4\.8K/);
  });

  it("formats zero", () => {
    expect(formatCurrencyCompact(0)).toMatch(/\$0/);
  });

  it("handles null", () => {
    expect(formatCurrencyCompact(null)).toMatch(/\$0/);
  });
});

// ── formatNumber ────────────────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats with commas and no decimals by default", () => {
    expect(formatNumber(4800)).toBe("4,800");
  });

  it("formats with specified decimal places", () => {
    expect(formatNumber(55.123, 2)).toBe("55.12");
  });

  it("handles null", () => {
    expect(formatNumber(null)).toBe("0");
  });

  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

// ── formatTemp ──────────────────────────────────────────────────────────

describe("formatTemp", () => {
  it("formats temperature with one decimal and degree F", () => {
    expect(formatTemp(55.2)).toBe("55.2\u00B0F");
  });

  it("handles null", () => {
    expect(formatTemp(null)).toBe("0.0\u00B0F");
  });

  it("handles string values", () => {
    expect(formatTemp("59.8")).toBe("59.8\u00B0F");
  });
});

// ── formatHumidity ──────────────────────────────────────────────────────

describe("formatHumidity", () => {
  it("formats humidity with one decimal and percent", () => {
    expect(formatHumidity(65.0)).toBe("65.0%");
  });

  it("handles null", () => {
    expect(formatHumidity(null)).toBe("0.0%");
  });
});

// ── formatVibration ─────────────────────────────────────────────────────

describe("formatVibration", () => {
  it("formats vibration with two decimals and mm/s", () => {
    expect(formatVibration(0.12)).toBe("0.12 mm/s");
  });

  it("handles null", () => {
    expect(formatVibration(null)).toBe("0.00 mm/s");
  });
});

// ── formatLight ─────────────────────────────────────────────────────────

describe("formatLight", () => {
  it("formats light with one decimal and lux", () => {
    expect(formatLight(0.5)).toBe("0.5 lux");
  });

  it("handles null", () => {
    expect(formatLight(null)).toBe("0.0 lux");
  });
});

// ── formatRelativeTime ──────────────────────────────────────────────────

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-11T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for very recent dates', () => {
    const recent = new Date("2026-04-11T11:59:45Z");
    expect(formatRelativeTime(recent)).toBe("just now");
  });

  it('returns "Xm ago" for minutes', () => {
    const fiveMinAgo = new Date("2026-04-11T11:55:00Z");
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it('returns "Xh ago" for hours', () => {
    const threeHoursAgo = new Date("2026-04-11T09:00:00Z");
    expect(formatRelativeTime(threeHoursAgo)).toBe("3h ago");
  });

  it('returns "Xd ago" for days', () => {
    const fiveDaysAgo = new Date("2026-04-06T12:00:00Z");
    expect(formatRelativeTime(fiveDaysAgo)).toBe("5d ago");
  });

  it("accepts string dates", () => {
    expect(formatRelativeTime("2026-04-11T11:55:00Z")).toBe("5m ago");
  });
});

// ── formatDate ──────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-03-15T00:00:00Z"));
    // Locale-dependent, but should contain "Mar" and "2026"
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });

  it("formats a string date", () => {
    const result = formatDate("2026-03-15");
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });
});

// ── percentChange ───────────────────────────────────────────────────────

describe("percentChange", () => {
  it("calculates positive percent change", () => {
    expect(percentChange(100, 150)).toBe(50);
  });

  it("calculates negative percent change", () => {
    expect(percentChange(200, 150)).toBe(-25);
  });

  it("returns 0 when both values are 0", () => {
    expect(percentChange(0, 0)).toBe(0);
  });

  it("returns null when from is 0 but to is non-zero", () => {
    expect(percentChange(0, 100)).toBeNull();
  });

  it("handles null/undefined inputs as 0", () => {
    expect(percentChange(null, null)).toBe(0);
    expect(percentChange(undefined, 100)).toBeNull();
  });

  it("handles string inputs", () => {
    expect(percentChange("100", "200")).toBe(100);
  });
});
