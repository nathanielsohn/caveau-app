import { describe, it, expect } from "vitest";
import {
  EventSlugSchema,
  RsvpBodySchema,
  EventSignupBodySchema,
  CreateEventBodySchema,
} from "../schemas";

describe("EventSlugSchema", () => {
  it("accepts lowercase-dashed slugs", () => {
    expect(EventSlugSchema.parse("naples-winter-wine-festival-2027")).toBe(
      "naples-winter-wine-festival-2027",
    );
  });

  it("rejects uppercase, spaces, and punctuation", () => {
    expect(() => EventSlugSchema.parse("Naples WWF")).toThrow();
    expect(() => EventSlugSchema.parse("slug_with_underscores")).toThrow();
    expect(() => EventSlugSchema.parse("slug.with.dots")).toThrow();
  });

  it("enforces length bounds", () => {
    expect(() => EventSlugSchema.parse("ab")).toThrow();
    expect(() => EventSlugSchema.parse("a".repeat(81))).toThrow();
  });
});

describe("RsvpBodySchema", () => {
  it("defaults to 1 seat when omitted", () => {
    const parsed = RsvpBodySchema.parse({
      eventId: "11111111-1111-1111-1111-111111111111",
    });
    expect(parsed.seats).toBe(1);
  });

  it("caps seats at 4 and rejects 0 or negatives", () => {
    const mkBody = (seats: number) => ({
      eventId: "11111111-1111-1111-1111-111111111111",
      seats,
    });
    expect(() => RsvpBodySchema.parse(mkBody(5))).toThrow();
    expect(() => RsvpBodySchema.parse(mkBody(0))).toThrow();
    expect(() => RsvpBodySchema.parse(mkBody(-1))).toThrow();
  });

  it("coerces string seat counts from FormData", () => {
    const parsed = RsvpBodySchema.parse({
      eventId: "11111111-1111-1111-1111-111111111111",
      seats: "2",
    });
    expect(parsed.seats).toBe(2);
  });
});

describe("EventSignupBodySchema", () => {
  it("normalizes email to lowercase", () => {
    const parsed = EventSignupBodySchema.parse({
      name: "Jane Doe",
      email: "JANE@EXAMPLE.COM",
    });
    expect(parsed.email).toBe("jane@example.com");
  });

  it("treats empty optional fields as undefined", () => {
    const parsed = EventSignupBodySchema.parse({
      name: "Jane",
      email: "jane@example.com",
      phone: "",
      notes: "   ",
    });
    expect(parsed.phone).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});

describe("CreateEventBodySchema", () => {
  const base = {
    title: "Test Event",
    slug: "test-event",
    locationName: "Caveau Naples",
    startsAt: "2027-01-30T18:00:00Z",
    endsAt: "2027-01-30T22:00:00Z",
    capacity: 100,
    priceUsd: 1200,
    memberOnly: "on",
  };

  it("accepts a well-formed body and coerces memberOnly checkbox", () => {
    const parsed = CreateEventBodySchema.parse(base);
    expect(parsed.memberOnly).toBe(true);
    expect(parsed.status).toBe("published");
  });

  it("rejects endsAt before startsAt", () => {
    expect(() =>
      CreateEventBodySchema.parse({
        ...base,
        startsAt: "2027-02-01T00:00:00Z",
        endsAt: "2027-01-30T22:00:00Z",
      }),
    ).toThrow(/End time/);
  });

  it("treats unchecked memberOnly as false", () => {
    const parsed = CreateEventBodySchema.parse({ ...base, memberOnly: null });
    expect(parsed.memberOnly).toBe(false);
  });

  it("caps capacity and price at sensible bounds", () => {
    expect(() =>
      CreateEventBodySchema.parse({ ...base, capacity: 10_000 }),
    ).toThrow();
    expect(() =>
      CreateEventBodySchema.parse({ ...base, priceUsd: 10_000_000 }),
    ).toThrow();
  });
});
