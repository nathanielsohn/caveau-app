import { describe, it, expect } from "vitest";
import { assertCanDispose, DispositionGuardError } from "../disposition-guard";

describe("assertCanDispose", () => {
  it("passes through an in-cellar wine without throwing", () => {
    expect(() =>
      assertCanDispose({ id: "w1", status: "in_cellar" }),
    ).not.toThrow();
  });

  it("throws not_found when the wine lookup returned null", () => {
    try {
      assertCanDispose(null);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DispositionGuardError);
      expect((e as DispositionGuardError).code).toBe("not_found");
      expect((e as Error).message).toBe("Not found");
    }
  });

  it("rejects a wine already marked sold (double-dispose guard)", () => {
    try {
      assertCanDispose({ id: "w1", status: "sold" });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(DispositionGuardError);
      expect((e as DispositionGuardError).code).toBe("already_disposed");
      expect((e as Error).message).toBe("Wine already disposed");
    }
  });

  it("rejects every non-cellar status", () => {
    for (const status of [
      "sold",
      "consumed",
      "transferred",
      "gifted",
      "removed",
    ]) {
      expect(() =>
        assertCanDispose({ id: "w1", status }),
      ).toThrowError(DispositionGuardError);
    }
  });

  it("rejects an unexpected/garbage status string defensively", () => {
    expect(() =>
      assertCanDispose({ id: "w1", status: "" }),
    ).toThrowError(DispositionGuardError);
    expect(() =>
      assertCanDispose({ id: "w1", status: "in_transit" }),
    ).toThrowError(DispositionGuardError);
  });
});
