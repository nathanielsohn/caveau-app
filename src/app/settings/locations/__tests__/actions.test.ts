import { describe, it, expect, vi, beforeEach } from "vitest";

const MEMBER_ID = "00000000-0000-4000-8000-00000000aaaa";
const FACILITY_ID = "00000000-0000-4000-8000-00000000bbbb";

const facilityCreate = vi.fn();
const cookieSet = vi.fn();
const cookieDelete = vi.fn();

vi.mock("@/lib/auth", () => ({
  getServerAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    facility: {
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    locker: {
      deleteMany: vi.fn(),
    },
    facilityMember: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (input) => {
      if (typeof input === "function") {
        return input({ facility: { create: facilityCreate } });
      }
      return Promise.all(input);
    }),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    set: cookieSet,
    delete: cookieDelete,
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createPrivateLocation,
  updatePrivateLocation,
  INITIAL_PRIVATE_LOCATION_FORM_STATE,
} from "../actions";

function withMember() {
  (getServerAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: MEMBER_ID },
  });
}

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  withMember();
  facilityCreate.mockResolvedValue({ id: FACILITY_ID });
  (prisma.facility.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
});

describe("private location settings actions", () => {
  it("creates a member-owned private location with a monitor locker and no slots", async () => {
    const result = await createPrivateLocation(
      INITIAL_PRIVATE_LOCATION_FORM_STATE,
      formData({
        name: "Bar Mar Wine Room",
        location: "Naples, FL",
        privateLocationKind: "restaurant",
        elevationFt: "12",
      }),
    );

    expect(result.ok).toBe(true);
    expect(facilityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "private_location",
          ownerMemberId: MEMBER_ID,
          privateLocationKind: "restaurant",
          name: "Bar Mar Wine Room",
          location: "Naples, FL",
          elevationFt: 12,
          members: { create: { memberId: MEMBER_ID } },
          lockers: {
            create: {
              lockerNumber: 1,
              zone: "PL",
              memberId: MEMBER_ID,
            },
          },
        }),
      }),
    );
    expect(cookieSet).toHaveBeenCalledWith(
      "caveau_facility",
      expect.stringContaining(`${FACILITY_ID}.`),
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("blocks creation after the per-member private location limit", async () => {
    (prisma.facility.count as ReturnType<typeof vi.fn>).mockResolvedValue(10);

    const result = await createPrivateLocation(
      INITIAL_PRIVATE_LOCATION_FORM_STATE,
      formData({
        name: "Warehouse",
        location: "Miami, FL",
        privateLocationKind: "warehouse",
        elevationFt: "",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/limit/i);
    expect(facilityCreate).not.toHaveBeenCalled();
  });

  it("resets certification when the physical location changes", async () => {
    (prisma.facility.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: FACILITY_ID,
      location: "Old address",
      elevationFt: 10,
    });
    (prisma.facility.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await updatePrivateLocation(
      INITIAL_PRIVATE_LOCATION_FORM_STATE,
      formData({
        facilityId: FACILITY_ID,
        name: "Residence Wine Room",
        location: "New address",
        privateLocationKind: "residence",
        elevationFt: "10",
      }),
    );

    expect(result.ok).toBe(true);
    expect(prisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: FACILITY_ID },
        data: expect.objectContaining({
          location: "New address",
          privateLocationCertifiedAt: null,
        }),
      }),
    );
  });
});
