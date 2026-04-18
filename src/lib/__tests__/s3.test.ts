/**
 * Unit tests for the S3 presigned-upload wrapper (feature #18).
 *
 * The env validator snapshots S3_UPLOAD_URL_TTL_SECONDS once at module
 * load, so each TTL clamping test resets the module cache and re-imports
 * under a fresh process.env. AWS SDK bindings are mocked so the tests
 * never touch the network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class S3Client {
    send = vi.fn().mockResolvedValue({});
  }
  class PutObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  class DeleteObjectCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand };
});

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type Mock = ReturnType<typeof vi.fn>;

const SIGNED_URL =
  "https://test-bucket.s3.us-east-1.amazonaws.com/images/test.jpg?X-Amz-Signature=abc";

async function importFreshS3() {
  vi.resetModules();
  return await import("../s3");
}

beforeEach(() => {
  vi.clearAllMocks();
  (getSignedUrl as Mock).mockResolvedValue(SIGNED_URL);
  process.env.AWS_S3_BUCKET = "test-bucket";
  process.env.AWS_REGION = "us-east-1";
  delete process.env.AWS_CLOUDFRONT_DOMAIN;
  delete process.env.S3_UPLOAD_URL_TTL_SECONDS;
});

afterEach(() => {
  delete process.env.AWS_S3_BUCKET;
  delete process.env.AWS_REGION;
  delete process.env.AWS_CLOUDFRONT_DOMAIN;
  delete process.env.S3_UPLOAD_URL_TTL_SECONDS;
});

describe("getUploadUrl — TTL clamping", () => {
  it("clamps a below-floor TTL up to 60 seconds", async () => {
    process.env.S3_UPLOAD_URL_TTL_SECONDS = "5";
    const { getUploadUrl } = await importFreshS3();

    await getUploadUrl(
      "wines/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
      "image/jpeg",
      1024,
    );

    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [, , opts] = (getSignedUrl as Mock).mock.calls[0];
    expect(opts.expiresIn).toBe(60);
  });

  it("clamps an above-ceiling TTL down to 900 seconds", async () => {
    process.env.S3_UPLOAD_URL_TTL_SECONDS = "99999";
    const { getUploadUrl } = await importFreshS3();

    await getUploadUrl(
      "wines/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
      "image/jpeg",
      1024,
    );

    const [, , opts] = (getSignedUrl as Mock).mock.calls[0];
    expect(opts.expiresIn).toBe(900);
  });

  it("passes an in-range TTL through unchanged", async () => {
    process.env.S3_UPLOAD_URL_TTL_SECONDS = "420";
    const { getUploadUrl } = await importFreshS3();

    await getUploadUrl(
      "wines/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
      "image/jpeg",
      1024,
    );

    const [, , opts] = (getSignedUrl as Mock).mock.calls[0];
    expect(opts.expiresIn).toBe(420);
  });

  it("falls back to the 300-second default when TTL env var is unset", async () => {
    const { getUploadUrl } = await importFreshS3();

    await getUploadUrl(
      "wines/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
      "image/jpeg",
      1024,
    );

    const [, , opts] = (getSignedUrl as Mock).mock.calls[0];
    expect(opts.expiresIn).toBe(300);
  });
});

describe("isAllowedImageType — MIME allowlist", () => {
  it("accepts image/jpeg, image/png, image/webp", async () => {
    const { isAllowedImageType } = await importFreshS3();
    expect(isAllowedImageType("image/jpeg")).toBe(true);
    expect(isAllowedImageType("image/png")).toBe(true);
    expect(isAllowedImageType("image/webp")).toBe(true);
  });

  it("rejects any other MIME type", async () => {
    const { isAllowedImageType } = await importFreshS3();
    // The rejection list is deliberately broad: older formats, vector
    // formats (SVG's XML carries XSS risk), and anything non-image.
    expect(isAllowedImageType("image/gif")).toBe(false);
    expect(isAllowedImageType("image/svg+xml")).toBe(false);
    expect(isAllowedImageType("image/heic")).toBe(false);
    expect(isAllowedImageType("application/pdf")).toBe(false);
    expect(isAllowedImageType("text/html")).toBe(false);
    expect(isAllowedImageType("")).toBe(false);
  });
});

describe("getPublicUrl — URL structure", () => {
  it("builds an S3 URL containing bucket, region, and key when only the bucket is set", async () => {
    process.env.AWS_REGION = "us-west-2";
    const { getPublicUrl } = await importFreshS3();

    const url = getPublicUrl("images/abc.jpg");

    expect(url).toContain("test-bucket");
    expect(url).toContain("us-west-2");
    expect(url).toContain("images/abc.jpg");
    expect(url).toMatch(/^https:\/\//);
  });

  it("prefers the CloudFront domain when set", async () => {
    process.env.AWS_CLOUDFRONT_DOMAIN = "cdn.example.com";
    const { getPublicUrl } = await importFreshS3();

    const url = getPublicUrl("images/abc.jpg");

    expect(url).toBe("https://cdn.example.com/images/abc.jpg");
  });

  it("returns null when the key is missing", async () => {
    const { getPublicUrl } = await importFreshS3();
    expect(getPublicUrl(null)).toBeNull();
    expect(getPublicUrl(undefined)).toBeNull();
    expect(getPublicUrl("")).toBeNull();
  });
});

describe("no-op behavior when AWS_S3_BUCKET is unset", () => {
  beforeEach(() => {
    delete process.env.AWS_S3_BUCKET;
  });

  it("getUploadUrl returns null and never calls getSignedUrl", async () => {
    const { getUploadUrl } = await importFreshS3();

    const result = await getUploadUrl(
      "wines/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003.jpg",
      "image/jpeg",
      1024,
    );

    expect(result).toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("getPublicUrl returns null when no bucket or CDN is configured", async () => {
    const { getPublicUrl } = await importFreshS3();
    expect(getPublicUrl("images/abc.jpg")).toBeNull();
  });

  it("isS3Configured reports false", async () => {
    const { isS3Configured } = await importFreshS3();
    expect(isS3Configured()).toBe(false);
  });
});

describe("isValidUploadKey — accepted shapes only", () => {
  const MEMBER = "00000000-0000-4000-8000-00000000aaaa";
  const WINE = "00000000-0000-4000-8000-00000000bbbb";
  const UPLOAD = "00000000-0000-4000-8000-00000000cccc";

  it("accepts wine image keys", async () => {
    const { isValidUploadKey } = await importFreshS3();
    expect(
      isValidUploadKey(`wines/${MEMBER}/${WINE}/${UPLOAD}.jpg`),
    ).toBe(true);
    expect(
      isValidUploadKey(`wines/${MEMBER}/${WINE}/${UPLOAD}.png`),
    ).toBe(true);
    expect(
      isValidUploadKey(`wines/${MEMBER}/${WINE}/${UPLOAD}.webp`),
    ).toBe(true);
  });

  it("accepts label-scan and NFC-intake keys", async () => {
    const { isValidUploadKey } = await importFreshS3();
    expect(
      isValidUploadKey(`wines/${MEMBER}/scans/${UPLOAD}.jpg`),
    ).toBe(true);
    expect(
      isValidUploadKey(`nfc-intake/${MEMBER}/${WINE}/${UPLOAD}.jpg`),
    ).toBe(true);
  });

  it("rejects path-traversal attempts", async () => {
    const { isValidUploadKey } = await importFreshS3();
    expect(isValidUploadKey(`wines/${MEMBER}/../${WINE}/${UPLOAD}.jpg`)).toBe(false);
    expect(isValidUploadKey(`wines/${MEMBER}/${WINE}/../${UPLOAD}.jpg`)).toBe(false);
  });

  it("rejects unknown prefixes, extensions, and shapes", async () => {
    const { isValidUploadKey } = await importFreshS3();
    expect(isValidUploadKey(`etc/passwd`)).toBe(false);
    expect(isValidUploadKey(`wines/${MEMBER}/${WINE}/${UPLOAD}.exe`)).toBe(false);
    expect(isValidUploadKey(`images/test.jpg`)).toBe(false);
    expect(isValidUploadKey("")).toBe(false);
  });

  it("rejects null-byte injection", async () => {
    const { isValidUploadKey } = await importFreshS3();
    expect(
      isValidUploadKey(`wines/${MEMBER}/${WINE}/${UPLOAD}.jpg\0.txt`),
    ).toBe(false);
  });
});
