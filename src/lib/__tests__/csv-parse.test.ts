import { describe, it, expect } from "vitest";
import { parseCsv, CsvParseError } from "../csv-parse";

describe("parseCsv", () => {
  it("parses a simple comma CSV", () => {
    const { headers, rows } = parseCsv("a,b,c\n1,2,3\n4,5,6");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([
      { a: "1", b: "2", c: "3" },
      { a: "4", b: "5", c: "6" },
    ]);
  });

  it("strips a UTF-8 BOM", () => {
    const { headers } = parseCsv("\uFEFFa,b\n1,2");
    expect(headers).toEqual(["a", "b"]);
  });

  it("handles quoted cells with embedded commas", () => {
    const { rows } = parseCsv('name,note\n"Petrus","Earthy, floral"');
    expect(rows[0]).toEqual({ name: "Petrus", note: "Earthy, floral" });
  });

  it("unescapes doubled quotes inside a quoted cell", () => {
    const { rows } = parseCsv('a\n"She said ""hi"""');
    expect(rows[0]!.a).toBe('She said "hi"');
  });

  it("handles CRLF line endings", () => {
    const { headers, rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("keeps multi-line quoted strings as one cell", () => {
    const input = 'name,note\n"Ornellaia","Line 1\nLine 2"\n';
    const { rows } = parseCsv(input);
    expect(rows[0]!.note).toBe("Line 1\nLine 2");
  });

  it("drops fully-empty trailing lines", () => {
    const { rows } = parseCsv("a\n1\n\n\n");
    expect(rows).toEqual([{ a: "1" }]);
  });

  it("trims surrounding whitespace in headers and cells", () => {
    const { headers, rows } = parseCsv("a , b\n 1 , 2 ");
    expect(headers).toEqual(["a", "b"]);
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("throws on empty input", () => {
    expect(() => parseCsv("")).toThrow(CsvParseError);
  });

  it("throws on duplicate headers", () => {
    expect(() => parseCsv("a,a\n1,2")).toThrow(/duplicate header/i);
  });

  it("parses a Vivino-shaped export with commas in reviews", () => {
    const input = [
      'Winery,Wine name,Vintage,Region,Style,Purchase price,Review',
      '"Petrus","Petrus",2018,"Pomerol","Merlot",5800,"Truffle, black cherry, iron."',
      '"Harlan","Harlan Estate",2018,"Napa Valley","Cabernet Sauvignon",1500,"Crème de cassis, graphite."',
    ].join("\n");
    const { rows } = parseCsv(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.Review).toBe("Truffle, black cherry, iron.");
    expect(rows[1]!["Wine name"]).toBe("Harlan Estate");
  });
});
