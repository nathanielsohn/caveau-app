import { describe, it, expect } from "vitest";
import {
  UuidSchema,
  EmailSchema,
  PasswordSchema,
  PriceSchema,
  VintageSchema,
  SignupBodySchema,
  CreateWineBodySchema,
  SensorIngestBodySchema,
  ValuationBodySchema,
  SensorHistoryQuerySchema,
  parseOr400,
  parsePathParamOr404,
} from "../schemas";

describe("UuidSchema", () => {
  it("accepts a valid UUID v4", () => {
    expect(() =>
      UuidSchema.parse("550e8400-e29b-41d4-a716-446655440000"),
    ).not.toThrow();
  });

  it("rejects an obvious non-UUID", () => {
    expect(() => UuidSchema.parse("not-a-uuid")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => UuidSchema.parse("")).toThrow();
  });
});

describe("EmailSchema", () => {
  it("normalizes case and trims", () => {
    const out = EmailSchema.parse("  Foo@Bar.COM  ");
    expect(out).toBe("foo@bar.com");
  });

  it("rejects an address without a TLD", () => {
    expect(() => EmailSchema.parse("foo@bar")).toThrow();
  });

  it("rejects an address with whitespace", () => {
    expect(() => EmailSchema.parse("foo @bar.com")).toThrow();
  });

  it("rejects an address over 254 chars", () => {
    const long = "a".repeat(60) + "@" + "b".repeat(190) + ".com";
    expect(() => EmailSchema.parse(long)).toThrow();
  });
});

describe("PasswordSchema", () => {
  it("rejects passwords shorter than 12 chars", () => {
    expect(() => PasswordSchema.parse("Aa1!bbbb")).toThrow();
  });

  it("rejects passwords missing an uppercase letter", () => {
    expect(() => PasswordSchema.parse("aaaaaaaaaa1!")).toThrow();
  });

  it("rejects passwords missing a digit", () => {
    expect(() => PasswordSchema.parse("Aaaaaaaaaaa!")).toThrow();
  });

  it("rejects passwords missing a symbol", () => {
    expect(() => PasswordSchema.parse("Password1234")).toThrow();
  });

  it("accepts a 12-char password with all classes", () => {
    expect(() => PasswordSchema.parse("Password12!a")).not.toThrow();
  });
});

describe("PriceSchema and VintageSchema", () => {
  it("rejects negative prices", () => {
    expect(() => PriceSchema.parse(-1)).toThrow();
  });

  it("rejects prices above 100M", () => {
    expect(() => PriceSchema.parse(200_000_000)).toThrow();
  });

  it("rejects vintages below 1800", () => {
    expect(() => VintageSchema.parse(1799)).toThrow();
  });

  it("rejects vintages more than a year in the future", () => {
    const fiveYearsAhead = new Date().getFullYear() + 5;
    expect(() => VintageSchema.parse(fiveYearsAhead)).toThrow();
  });
});

describe("SignupBodySchema", () => {
  const valid = {
    name: "Jane Doe",
    email: "jane@example.com",
    password: "Password12!a",
    csrfToken: "abc",
  };

  it("accepts a valid body", () => {
    expect(() => SignupBodySchema.parse(valid)).not.toThrow();
  });

  it("rejects empty name", () => {
    expect(() => SignupBodySchema.parse({ ...valid, name: "" })).toThrow();
  });

  it("rejects missing csrfToken", () => {
    expect(() => SignupBodySchema.parse({ ...valid, csrfToken: "" })).toThrow();
  });

  it("rejects missing email", () => {
    const { name, password, csrfToken } = valid;
    expect(() =>
      SignupBodySchema.parse({ name, password, csrfToken }),
    ).toThrow();
  });
});

describe("CreateWineBodySchema", () => {
  it("coerces stringified numbers", () => {
    const out = CreateWineBodySchema.parse({
      name: "Test Wine",
      vintage: "2020",
      region: "Bordeaux",
      varietal: "Cabernet",
      producer: "Château Test",
      purchasePrice: "1500",
    });
    expect(out.vintage).toBe(2020);
    expect(out.purchasePrice).toBe(1500);
  });

  it("rejects malformed input", () => {
    expect(() =>
      CreateWineBodySchema.parse({
        name: "",
        vintage: "abc",
        region: "x",
        varietal: "y",
        producer: "z",
        purchasePrice: "x",
      }),
    ).toThrow();
  });
});

describe("ValuationBodySchema", () => {
  it("accepts a minimal body with just price", () => {
    expect(() => ValuationBodySchema.parse({ price: 1000 })).not.toThrow();
  });

  it("rejects unknown source", () => {
    expect(() =>
      ValuationBodySchema.parse({ price: 1000, source: "made-up" }),
    ).toThrow();
  });
});

describe("SensorHistoryQuerySchema", () => {
  it("requires lockerId to be a UUID", () => {
    expect(() =>
      SensorHistoryQuerySchema.parse({ lockerId: "not-uuid" }),
    ).toThrow();
  });

  it("defaults range to 24h", () => {
    const out = SensorHistoryQuerySchema.parse({
      lockerId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(out.range).toBe("24h");
  });

  it("rejects unsupported range values", () => {
    expect(() =>
      SensorHistoryQuerySchema.parse({
        lockerId: "550e8400-e29b-41d4-a716-446655440000",
        range: "5m",
      }),
    ).toThrow();
  });
});

describe("SensorIngestBodySchema", () => {
  const valid = {
    lockerId: "550e8400-e29b-41d4-a716-446655440000",
    temperature: 55.25,
    humidity: 62.5,
    vibration: 0.125,
    lightLux: 50_000,
    timestamp: "2026-04-28T12:00:00.000Z",
    deviceSignature: "device-serial-1",
  };

  it("accepts light readings that fit the widened Decimal(7,2) column", () => {
    expect(() => SensorIngestBodySchema.parse(valid)).not.toThrow();
  });

  it("rejects impossible light readings above the device envelope", () => {
    expect(() =>
      SensorIngestBodySchema.parse({ ...valid, lightLux: 50_000.01 }),
    ).toThrow();
  });
});

describe("parseOr400 / parsePathParamOr404", () => {
  it("parseOr400 returns ok=true on valid input", () => {
    const r = parseOr400(UuidSchema, "550e8400-e29b-41d4-a716-446655440000");
    expect(r.ok).toBe(true);
  });

  it("parseOr400 returns a 400 response on invalid input", async () => {
    const r = parseOr400(UuidSchema, "garbage");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toBeTruthy();
    }
  });

  it("parsePathParamOr404 returns 404 instead of 400", async () => {
    const r = parsePathParamOr404(UuidSchema, "garbage");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(404);
    }
  });
});
