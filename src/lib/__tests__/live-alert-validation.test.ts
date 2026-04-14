import { describe, it, expect } from "vitest";
import { validateLiveAlert } from "../validate-live-alert";

describe("validateLiveAlert", () => {
  const valid = {
    type: "temperature",
    severity: "warning",
    message: "Temp 61F",
  };

  it("accepts a well-formed payload and echoes the data", () => {
    const result = validateLiveAlert(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        type: "temperature",
        severity: "warning",
        message: "Temp 61F",
      });
    }
  });

  it("accepts every supported alert type", () => {
    for (const type of [
      "temperature",
      "humidity",
      "vibration",
      "light",
      "door",
      "access",
    ]) {
      expect(validateLiveAlert({ ...valid, type }).ok).toBe(true);
    }
  });

  it("accepts every supported severity", () => {
    for (const severity of ["info", "warning", "critical"]) {
      expect(validateLiveAlert({ ...valid, severity }).ok).toBe(true);
    }
  });

  it("rejects an unknown alert type with a clear error", () => {
    const result = validateLiveAlert({ ...valid, type: "fire" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid type");
  });

  it("rejects an unknown severity with a clear error", () => {
    const result = validateLiveAlert({ ...valid, severity: "panic" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid severity");
  });

  it("rejects an empty message", () => {
    const result = validateLiveAlert({ ...valid, message: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-string message (number)", () => {
    const result = validateLiveAlert({ ...valid, message: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid message");
  });

  it("rejects a non-string message (null)", () => {
    const result = validateLiveAlert({ ...valid, message: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid message");
  });

  it("truncates an oversized message to 500 characters", () => {
    const huge = "x".repeat(2000);
    const result = validateLiveAlert({ ...valid, message: huge });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.message.length).toBe(500);
  });

  it("rejects a non-string type", () => {
    const result = validateLiveAlert({ ...valid, type: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid type");
  });

  it("rejects null input", () => {
    // @ts-expect-error — intentionally probing the runtime guard
    const result = validateLiveAlert(null);
    expect(result.ok).toBe(false);
  });
});
