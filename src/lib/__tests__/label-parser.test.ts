import { describe, it, expect } from "vitest";
import { parseWineLabel } from "../label-parser";

describe("parseWineLabel", () => {
  it("returns empty object for empty input", () => {
    expect(parseWineLabel("")).toEqual({});
  });

  it("returns empty object for whitespace only", () => {
    expect(parseWineLabel("   \n   \n")).toEqual({});
  });

  it("extracts only a vintage when nothing else matches", () => {
    const r = parseWineLabel("Some Mystery Bottle\n2015");
    expect(r.vintage).toBe(2015);
  });

  it("ignores out-of-range four-digit numbers", () => {
    const r = parseWineLabel("Cuvée 1492\nLot Number 8888");
    expect(r.vintage).toBeUndefined();
  });

  it("extracts a varietal regardless of case", () => {
    const r = parseWineLabel("Some Vineyard\nCABERNET SAUVIGNON\n2018");
    expect(r.varietal).toBe("Cabernet Sauvignon");
    expect(r.vintage).toBe(2018);
  });

  it("extracts a hardcoded region", () => {
    const r = parseWineLabel("Domaine Test\nNapa Valley\n2019");
    expect(r.region).toBe("Napa Valley");
  });

  it("parses a Bordeaux-style label with appellation", () => {
    const r = parseWineLabel(
      "Château Pichon\nGrand Cru Classé\nAppellation Pauillac Contrôlée\n2015",
    );
    expect(r.producer).toBe("Château Pichon");
    expect(r.region).toBe("Pauillac");
    expect(r.vintage).toBe(2015);
  });

  it("parses a Napa-style label with producer + varietal + region + vintage", () => {
    const r = parseWineLabel(
      "Opus One\nCabernet Sauvignon\nNapa Valley\n2018",
    );
    expect(r.producer).toBe("Opus One");
    expect(r.varietal).toBe("Cabernet Sauvignon");
    expect(r.region).toBe("Napa Valley");
    expect(r.vintage).toBe(2018);
  });

  it("returns no vintage when no four-digit year is present", () => {
    const r = parseWineLabel("Random Bottle\nMerlot\nSonoma");
    expect(r.vintage).toBeUndefined();
    expect(r.varietal).toBe("Merlot");
    expect(r.region).toBe("Sonoma");
  });

  it("matches the first varietal when several appear", () => {
    const r = parseWineLabel("Blend\nCabernet Sauvignon Merlot Blend\n2017");
    expect(r.varietal).toBe("Cabernet Sauvignon");
  });

  it("handles unicode accents in producer + appellation", () => {
    const r = parseWineLabel(
      "Château d'Yquem\nAppellation Sauternes Contrôlée\n2010",
    );
    expect(r.producer).toBe("Château d'Yquem");
    expect(r.region).toBe("Sauternes");
    expect(r.vintage).toBe(2010);
  });

  it("returns nothing useful for pure junk text", () => {
    const r = parseWineLabel("@@@ ### !!!\n??? %%% &&&");
    expect(r.vintage).toBeUndefined();
    expect(r.varietal).toBeUndefined();
    expect(r.region).toBeUndefined();
  });

  it("strips matched fields from the producer/name lines", () => {
    const r = parseWineLabel("Stag's Leap\nCabernet Sauvignon\nNapa Valley\n2019");
    expect(r.producer).toBe("Stag's Leap");
    // name should not echo the varietal/region/vintage
    expect(r.name?.toLowerCase() ?? "").not.toContain("cabernet");
    expect(r.name?.toLowerCase() ?? "").not.toContain("napa");
  });
});
