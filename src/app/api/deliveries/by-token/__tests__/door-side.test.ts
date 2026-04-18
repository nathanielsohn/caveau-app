/**
 * Route tests for the door-side Deliver Now API (feature #51, Step 3).
 *
 * Mirrors the mock style of ../__tests__/deliveries.test.ts: mock prisma,
 * rate-limit, and the delivery helper's loadDeliveryByDriverToken. We stub
 * loadDeliveryByDriverToken rather than the raw DB findUnique so tests
 * assert route behaviour (state-transition guards, id-scan matching,
 * rate-limit trips, photoKey prefix checks) without re-testing the helper.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    deliveryRequest: {
      update: vi.fn(),
    },
    deliveryEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/s3", () => ({
  getUploadUrl: vi.fn(),
  extensionForType: vi.fn(() => "jpg"),
}));

vi.mock("@/lib/delivery", async () => {
  const actual = await vi.importActual<typeof import("@/lib/delivery")>(
    "@/lib/delivery",
  );
  return {
    ...actual,
    loadDeliveryByDriverToken: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { getUploadUrl } from "@/lib/s3";
import { loadDeliveryByDriverToken } from "@/lib/delivery";

type Mock = ReturnType<typeof vi.fn>;

const DELIVERY_A = "00000000-0000-4000-8000-000000000aaa";
const DELIVERY_B = "00000000-0000-4000-8000-000000000bbb";
const TOKEN_A = "A".repeat(43);
const TOKEN_B = "B".repeat(43);
const RECIP_ID = "00000000-0000-4000-8000-0000000000cc";

interface BundleOverrides {
  id?: string;
  status?: string;
  otpRequired?: boolean;
  expiresAt?: Date;
  recipients?: Array<{ id: string; name: string; relationship: string | null }>;
}

function bundleFor(overrides: BundleOverrides = {}) {
  return {
    delivery: {
      id: overrides.id ?? DELIVERY_A,
      memberId: "member-id",
      status: (overrides.status ?? "otp_verified") as never,
      otpRequired: overrides.otpRequired ?? true,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      completedAt: null,
      cancelledAt: null,
      deliveryAddressLine1: "1245 Galleon Dr",
      deliveryAddressLine2: null,
      deliveryCity: "Naples",
      deliveryState: "FL",
      deliveryPostalCode: "34102",
    },
    member: { name: "Robert Saenz" },
    items: [
      {
        id: "item-1",
        name: "Screaming Eagle",
        vintage: 2019,
        producer: "Screaming Eagle",
      },
    ],
    recipients: overrides.recipients ?? [
      { id: RECIP_ID, name: "Isabella Saenz", relationship: "Spouse" },
    ],
  };
}

function allowRateLimit() {
  (checkRateLimit as unknown as Mock).mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: Date.now() + 60_000,
  });
}

function stubTransaction() {
  (prisma.$transaction as unknown as Mock).mockImplementation(
    async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubTransaction();
});

// ── handoff-start ────────────────────────────────────────────────────────

describe("POST /api/deliveries/by-token/[token]/handoff-start", () => {
  it("returns 404 when the token doesn't resolve to a delivery", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 on a structurally invalid token without touching the DB", async () => {
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: "too-short" }),
    });
    expect(res.status).toBe(404);
    expect(loadDeliveryByDriverToken).not.toHaveBeenCalled();
  });

  it("refuses the OTP-required branch when status is still address_confirmed", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "address_confirmed", otpRequired: true }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(409);
    expect(prisma.deliveryRequest.update).not.toHaveBeenCalled();
  });

  it("advances from address_confirmed when !otpRequired", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "address_confirmed", otpRequired: false }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(200);
    expect(prisma.deliveryRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "handoff_started" }),
      }),
    );
  });

  it("returns 410 when the delivery has expired", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({
        status: "otp_verified",
        expiresAt: new Date(Date.now() - 60_000),
      }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(410);
  });

  it("returns 409 when the delivery is cancelled", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "cancelled" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/handoff-start/route"
    );
    const res = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("invalid_state");
  });
});

// ── id-scan ──────────────────────────────────────────────────────────────

describe("POST /api/deliveries/by-token/[token]/id-scan", () => {
  const body = (name: string) =>
    new NextRequest("http://localhost/api/deliveries/by-token/x/id-scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });

  it("case-insensitive substring match advances to id_scanned", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    const res = await POST(body("isabel"), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.matchedRecipientName).toBe("Isabella Saenz");
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe("id_scanned");
    expect(updateArgs.data.scannedRecipientName).toBe("isabel");
    expect(prisma.deliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "id_scanned",
          payload: { matchedRecipientId: RECIP_ID },
        }),
      }),
    );
  });

  it("matches with uppercase input", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    const res = await POST(body("ISABELLA SAENZ"), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 401 no_recipient_match when the name isn't registered", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    const res = await POST(body("Nobody Random"), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("no_recipient_match");
    expect(prisma.deliveryRequest.update).not.toHaveBeenCalled();
  });

  it("trips 429 when the rate limiter refuses", async () => {
    (checkRateLimit as unknown as Mock).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    const res = await POST(body("Isabella"), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(429);
  });

  it("cross-token scoping — posting token-B loads delivery B, never A", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({
        id: DELIVERY_B,
        status: "handoff_started",
      }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    await POST(body("Isabella"), {
      params: Promise.resolve({ token: TOKEN_B }),
    });
    expect(loadDeliveryByDriverToken).toHaveBeenCalledWith(TOKEN_B);
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.where.id).toBe(DELIVERY_B);
  });

  it("returns 409 when the delivery isn't at handoff_started yet", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "otp_verified" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/id-scan/route"
    );
    const res = await POST(body("Isabella"), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(409);
  });
});

// ── upload-url ───────────────────────────────────────────────────────────

describe("POST /api/deliveries/by-token/[token]/upload-url", () => {
  const body = () =>
    new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contentType: "image/jpeg",
        contentLength: 100_000,
      }),
    });

  it("returns a presigned URL + key when S3 is configured and status is id_scanned", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "id_scanned" }),
    );
    (getUploadUrl as Mock).mockResolvedValue("https://s3.example/presigned");
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/upload-url/route"
    );
    const res = await POST(body(), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.uploadUrl).toBe("https://s3.example/presigned");
    expect(data.key).toMatch(new RegExp(`^deliveries/${DELIVERY_A}/`));
  });

  it("returns 503 when S3 is unconfigured (getUploadUrl returns null)", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "id_scanned" }),
    );
    (getUploadUrl as Mock).mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/upload-url/route"
    );
    const res = await POST(body(), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe("upload_not_configured");
  });

  it("returns 409 when status isn't id_scanned", async () => {
    allowRateLimit();
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/upload-url/route"
    );
    const res = await POST(body(), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(409);
    expect(getUploadUrl).not.toHaveBeenCalled();
  });
});

// ── complete ─────────────────────────────────────────────────────────────

describe("POST /api/deliveries/by-token/[token]/complete", () => {
  const body = (photoKey: string) =>
    new NextRequest("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoKey }),
    });

  it("rejects a photoKey that doesn't belong to this delivery", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "id_scanned" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/complete/route"
    );
    const res = await POST(body(`deliveries/${DELIVERY_B}/abc.jpg`), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_key");
    expect(prisma.deliveryRequest.update).not.toHaveBeenCalled();
  });

  it("happy path — advances to completed and persists photoKey + events", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "id_scanned" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/complete/route"
    );
    const key = `deliveries/${DELIVERY_A}/abc.jpg`;
    const res = await POST(body(key), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(200);
    const updateArgs = (prisma.deliveryRequest.update as Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe("completed");
    expect(updateArgs.data.handoffPhotoKey).toBe(key);
    // Two events appended: photo_captured and completed.
    expect(prisma.deliveryEvent.create).toHaveBeenCalledTimes(2);
  });

  it("returns 409 when status isn't id_scanned", async () => {
    (loadDeliveryByDriverToken as Mock).mockResolvedValue(
      bundleFor({ status: "handoff_started" }),
    );
    const { POST } = await import(
      "@/app/api/deliveries/by-token/[token]/complete/route"
    );
    const res = await POST(body(`deliveries/${DELIVERY_A}/abc.jpg`), {
      params: Promise.resolve({ token: TOKEN_A }),
    });
    expect(res.status).toBe(409);
  });
});
