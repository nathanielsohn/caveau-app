import { describe, it, expect } from "vitest";
import { simulateReading, checkThresholds, THRESHOLDS } from "../sensors";
import type { SensorSnapshot } from "../sensors";

describe("simulateReading", () => {
  it("returns all expected sensor fields", () => {
    const reading = simulateReading();
    expect(reading).toHaveProperty("temperature");
    expect(reading).toHaveProperty("humidity");
    expect(reading).toHaveProperty("vibration");
    expect(reading).toHaveProperty("lightLux");
    expect(reading).toHaveProperty("timestamp");
  });

  it("returns a timestamp that is a Date object", () => {
    const reading = simulateReading();
    expect(reading.timestamp).toBeInstanceOf(Date);
  });

  it("uses the provided date when given", () => {
    const date = new Date("2025-06-15T14:30:00Z");
    const reading = simulateReading(date);
    expect(reading.timestamp).toBe(date);
  });

  it("returns temperature within a reasonable range (45-65°F)", () => {
    // Run many iterations to test distribution
    for (let i = 0; i < 100; i++) {
      const reading = simulateReading();
      expect(reading.temperature).toBeGreaterThan(45);
      expect(reading.temperature).toBeLessThan(65);
    }
  });

  it("returns humidity within a reasonable range (40-90%)", () => {
    for (let i = 0; i < 100; i++) {
      const reading = simulateReading();
      expect(reading.humidity).toBeGreaterThan(40);
      expect(reading.humidity).toBeLessThan(90);
    }
  });

  it("returns vibration as a non-negative number", () => {
    for (let i = 0; i < 100; i++) {
      const reading = simulateReading();
      expect(reading.vibration).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns lightLux as a non-negative number", () => {
    for (let i = 0; i < 100; i++) {
      const reading = simulateReading();
      expect(reading.lightLux).toBeGreaterThanOrEqual(0);
    }
  });

  it("rounds temperature to 2 decimal places", () => {
    const reading = simulateReading();
    const decimals = reading.temperature.toString().split(".")[1];
    expect(!decimals || decimals.length <= 2).toBe(true);
  });

  it("rounds vibration to 3 decimal places", () => {
    const reading = simulateReading();
    const decimals = reading.vibration.toString().split(".")[1];
    expect(!decimals || decimals.length <= 3).toBe(true);
  });
});

describe("THRESHOLDS", () => {
  it("has temperature thresholds of 50-59°F", () => {
    expect(THRESHOLDS.temp.min).toBe(50);
    expect(THRESHOLDS.temp.max).toBe(59);
  });

  it("has humidity thresholds of 55-75%", () => {
    expect(THRESHOLDS.humidity.min).toBe(55);
    expect(THRESHOLDS.humidity.max).toBe(75);
  });

  it("has vibration max threshold of 0.5 mm/s", () => {
    expect(THRESHOLDS.vibration.max).toBe(0.5);
  });
});

describe("checkThresholds", () => {
  function makeReading(overrides: Partial<SensorSnapshot> = {}): SensorSnapshot {
    return {
      temperature: 55,
      humidity: 65,
      vibration: 0.1,
      lightLux: 0,
      timestamp: new Date(),
      ...overrides,
    };
  }

  it("returns no alerts for normal readings", () => {
    const alerts = checkThresholds(makeReading());
    expect(alerts).toHaveLength(0);
  });

  it("returns a warning for high temperature (59-62°F)", () => {
    const alerts = checkThresholds(makeReading({ temperature: 60 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("temperature");
    expect(alerts[0]!.severity).toBe("warning");
  });

  it("returns a critical alert for very high temperature (>62°F)", () => {
    const alerts = checkThresholds(makeReading({ temperature: 63 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("temperature");
    expect(alerts[0]!.severity).toBe("critical");
  });

  it("returns a warning for low temperature (47-50°F)", () => {
    const alerts = checkThresholds(makeReading({ temperature: 49 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("temperature");
    expect(alerts[0]!.severity).toBe("warning");
  });

  it("returns a critical alert for very low temperature (<47°F)", () => {
    const alerts = checkThresholds(makeReading({ temperature: 46 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("temperature");
    expect(alerts[0]!.severity).toBe("critical");
  });

  it("returns a warning for high humidity (>75%)", () => {
    const alerts = checkThresholds(makeReading({ humidity: 76 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("humidity");
    expect(alerts[0]!.severity).toBe("warning");
  });

  it("returns a warning for low humidity (<55%)", () => {
    const alerts = checkThresholds(makeReading({ humidity: 54 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("humidity");
    expect(alerts[0]!.severity).toBe("warning");
  });

  it("returns a warning for vibration (0.5-1.0 mm/s)", () => {
    const alerts = checkThresholds(makeReading({ vibration: 0.7 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("vibration");
    expect(alerts[0]!.severity).toBe("warning");
  });

  it("returns a critical alert for high vibration (>1.0 mm/s)", () => {
    const alerts = checkThresholds(makeReading({ vibration: 1.5 }));
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.type).toBe("vibration");
    expect(alerts[0]!.severity).toBe("critical");
  });

  it("returns multiple alerts when multiple thresholds are exceeded", () => {
    const alerts = checkThresholds(
      makeReading({ temperature: 60, humidity: 76, vibration: 0.7 })
    );
    expect(alerts).toHaveLength(3);
    const types = alerts.map((a) => a.type);
    expect(types).toContain("temperature");
    expect(types).toContain("humidity");
    expect(types).toContain("vibration");
  });

  it("sets resolved to false on all generated alerts", () => {
    const alerts = checkThresholds(makeReading({ temperature: 60 }));
    for (const alert of alerts) {
      expect(alert.resolved).toBe(false);
    }
  });

  it("generates unique alert IDs based on timestamp and type", () => {
    const alerts = checkThresholds(
      makeReading({ temperature: 60, humidity: 76 })
    );
    const ids = alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes descriptive messages with actual values", () => {
    const alerts = checkThresholds(makeReading({ temperature: 60.5 }));
    expect(alerts[0]!.message).toContain("60.5");
  });
});
