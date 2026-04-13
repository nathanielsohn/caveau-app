import { describe, it, expect } from "vitest";
import { safeCallback } from "../safe-callback";

describe("safeCallback", () => {
  it("accepts a same-origin path", () => {
    expect(safeCallback("/dashboard")).toBe("/dashboard");
    expect(safeCallback("/wine/abc-123")).toBe("/wine/abc-123");
  });

  it("rejects null and empty input", () => {
    expect(safeCallback(null)).toBeNull();
    expect(safeCallback("")).toBeNull();
    expect(safeCallback(undefined)).toBeNull();
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(safeCallback("//evil.com")).toBeNull();
    expect(safeCallback("//evil.com/path")).toBeNull();
  });

  it("rejects absolute URLs", () => {
    expect(safeCallback("https://evil.com")).toBeNull();
    expect(safeCallback("http://evil.com/path")).toBeNull();
    expect(safeCallback("javascript:alert(1)")).toBeNull();
  });

  it("rejects encoded protocol-relative attempts", () => {
    expect(safeCallback("/%2F%2Fevil.com")).toBeNull();
    expect(safeCallback("/%2f%2fevil.com")).toBeNull();
  });

  it("rejects encoded scheme attempts", () => {
    expect(safeCallback("/%3A%2F%2Fevil.com")).toBeNull();
  });

  it("rejects malformed URI sequences", () => {
    expect(safeCallback("/%E0")).toBeNull();
  });

  it("accepts paths with query strings and hashes", () => {
    expect(safeCallback("/wine/123?tab=details#top")).toBe(
      "/wine/123?tab=details#top",
    );
  });

  it("rejects backslash-prefixed paths (legacy IE/Edge)", () => {
    expect(safeCallback("\\/evil.com")).toBeNull();
    expect(safeCallback("\\\\evil.com")).toBeNull();
  });

  it("rejects URL-encoded backslash protocol-relative", () => {
    expect(safeCallback("/%5Cevil.com")).toBeNull();
  });

  it("rejects javascript: and data: schemes", () => {
    expect(safeCallback("javascript:alert(1)")).toBeNull();
    expect(safeCallback("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeCallback("vbscript:msgbox()")).toBeNull();
  });

  it("rejects non-string input", () => {
    // @ts-expect-error -- testing runtime defense against bad callers
    expect(safeCallback(42)).toBeNull();
    // @ts-expect-error -- testing runtime defense against bad callers
    expect(safeCallback({})).toBeNull();
  });

  it("rejects absurdly long inputs", () => {
    expect(safeCallback("/" + "a".repeat(2049))).toBeNull();
  });
});
