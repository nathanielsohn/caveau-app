import { describe, it, expect } from "vitest";
import { detectSource, suggestMapping } from "../migration-mapping";

describe("detectSource", () => {
  it("detects Vivino from Wine name + Winery", () => {
    const headers = ["Winery", "Wine name", "Vintage", "Region", "Style"];
    expect(detectSource(headers)).toBe("vivino");
  });

  it("detects CellarTracker from iWine alone", () => {
    const headers = ["iWine", "Wine", "Vintage", "Producer"];
    expect(detectSource(headers)).toBe("cellartracker");
  });

  it("detects CellarTracker from three-of-four markers without iWine", () => {
    const headers = ["Wine", "Varietal", "Producer", "Vintage"];
    expect(detectSource(headers)).toBe("cellartracker");
  });

  it("falls back to other when markers are absent", () => {
    const headers = ["bottle", "year", "winery"];
    expect(detectSource(headers)).toBe("other");
  });
});

describe("suggestMapping", () => {
  it("maps a canonical Vivino export", () => {
    const headers = [
      "Winery",
      "Wine name",
      "Vintage",
      "Region",
      "Style",
      "Purchase price",
      "Review",
    ];
    expect(suggestMapping("vivino", headers)).toEqual({
      name: "Wine name",
      vintage: "Vintage",
      region: "Region",
      varietal: "Style",
      producer: "Winery",
      purchasePrice: "Purchase price",
      tastingNotes: "Review",
    });
  });

  it("maps a canonical CellarTracker export", () => {
    const headers = [
      "iWine",
      "Wine",
      "Vintage",
      "Region",
      "SubRegion",
      "Varietal",
      "Producer",
      "Price",
      "CTNote",
    ];
    expect(suggestMapping("cellartracker", headers)).toEqual({
      name: "Wine",
      vintage: "Vintage",
      region: "Region",
      varietal: "Varietal",
      producer: "Producer",
      purchasePrice: "Price",
      tastingNotes: "CTNote",
    });
  });

  it("falls back to SubRegion when Region is missing", () => {
    const headers = ["Wine", "Vintage", "SubRegion", "Varietal", "Producer", "Price"];
    const mapping = suggestMapping("cellartracker", headers);
    expect(mapping.region).toBe("SubRegion");
  });

  it("falls back to MyPrice when Price is missing", () => {
    const headers = ["Wine", "Vintage", "Region", "Varietal", "Producer", "MyPrice"];
    const mapping = suggestMapping("cellartracker", headers);
    expect(mapping.purchasePrice).toBe("MyPrice");
  });

  it("returns an empty mapping for unknown sources", () => {
    expect(suggestMapping("other", ["a", "b", "c"])).toEqual({});
  });

  it("returns null for Caveau fields not present in headers", () => {
    const mapping = suggestMapping("vivino", ["Wine name", "Vintage"]);
    expect(mapping.name).toBe("Wine name");
    expect(mapping.vintage).toBe("Vintage");
    expect(mapping.region).toBeNull();
    expect(mapping.producer).toBeNull();
  });
});
