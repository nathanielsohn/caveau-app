import { describe, it, expect } from "vitest";
import {
  certificateIntegrityHash,
  provenanceBundleHash,
} from "../certificate-hash";

const fixedInput = {
  wineId: "11111111-1111-1111-1111-111111111111",
  lockerId: "22222222-2222-2222-2222-222222222222",
  monitoringStart: new Date("2025-01-01T00:00:00.000Z"),
  monitoringEnd: new Date("2025-02-01T00:00:00.000Z"),
};

describe("certificateIntegrityHash", () => {
  it("produces a deterministic 64-char hex string", () => {
    const h = certificateIntegrityHash(fixedInput);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(certificateIntegrityHash(fixedInput)).toBe(h);
  });

  it("accepts Date and ISO string forms and returns the same hash", () => {
    const withDates = certificateIntegrityHash(fixedInput);
    const withStrings = certificateIntegrityHash({
      ...fixedInput,
      monitoringStart: fixedInput.monitoringStart.toISOString(),
      monitoringEnd: fixedInput.monitoringEnd.toISOString(),
    });
    expect(withStrings).toBe(withDates);
  });

  it("differs when any field changes (tamper detection)", () => {
    const base = certificateIntegrityHash(fixedInput);
    expect(
      certificateIntegrityHash({ ...fixedInput, wineId: "33333333-3333-3333-3333-333333333333" }),
    ).not.toBe(base);
    expect(
      certificateIntegrityHash({ ...fixedInput, lockerId: "44444444-4444-4444-4444-444444444444" }),
    ).not.toBe(base);
    expect(
      certificateIntegrityHash({
        ...fixedInput,
        monitoringEnd: new Date("2025-02-02T00:00:00.000Z"),
      }),
    ).not.toBe(base);
  });
});

describe("provenanceBundleHash", () => {
  it("is stable regardless of object key order (canonical JSON)", () => {
    const a = provenanceBundleHash({ alpha: 1, beta: [1, 2, { k: "v" }] });
    const b = provenanceBundleHash({ beta: [1, 2, { k: "v" }], alpha: 1 });
    expect(a).toBe(b);
  });

  it("changes when array order changes (order is semantic in arrays)", () => {
    const a = provenanceBundleHash({ events: [1, 2, 3] });
    const b = provenanceBundleHash({ events: [3, 2, 1] });
    expect(a).not.toBe(b);
  });

  it("changes when any leaf value changes (tamper detection)", () => {
    const base = provenanceBundleHash({ wineId: "w1", temp: 55 });
    expect(provenanceBundleHash({ wineId: "w1", temp: 56 })).not.toBe(base);
    expect(provenanceBundleHash({ wineId: "w2", temp: 55 })).not.toBe(base);
  });

  it("produces a 64-char hex string", () => {
    expect(provenanceBundleHash({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });
});
