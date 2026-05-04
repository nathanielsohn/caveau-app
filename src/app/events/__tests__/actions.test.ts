import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getServerAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { revalidatePath } from "next/cache";
import { getServerAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { INITIAL_RSVP_STATE, rsvpToEvent } from "../actions";

const MEMBER_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";

function formData(seats: number): FormData {
  const data = new FormData();
  data.set("eventId", EVENT_ID);
  data.set("seats", String(seats));
  return data;
}

function sessionAsMember() {
  (getServerAuth as Mock).mockResolvedValue({
    user: {
      id: MEMBER_ID,
      role: "member",
      email: "member@example.com",
      name: "Member",
    },
  });
}

function makeTx({
  capacity,
  taken,
  existingSeats = null,
}: {
  capacity: number;
  taken: number;
  existingSeats?: number | null;
}) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: EVENT_ID }]),
    event: {
      findUnique: vi.fn().mockResolvedValue({
        id: EVENT_ID,
        slug: "member-dinner",
        capacity,
        status: "published",
        memberOnly: true,
      }),
    },
    eventRsvp: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { seats: taken } }),
      findUnique: vi.fn().mockResolvedValue(
        existingSeats === null
          ? null
          : { id: "rsvp-1", seats: existingSeats, cancelledAt: null },
      ),
      upsert: vi.fn().mockResolvedValue({ id: "rsvp-1" }),
    },
  };
}

function runTransactionWith(tx: ReturnType<typeof makeTx>) {
  (prisma.$transaction as unknown as Mock).mockImplementation(
    async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rsvpToEvent", () => {
  it("locks the event row and writes the RSVP inside one transaction", async () => {
    sessionAsMember();
    const tx = makeTx({ capacity: 10, taken: 6 });
    runTransactionWith(tx);

    const result = await rsvpToEvent(INITIAL_RSVP_STATE, formData(2));

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        confirmedSeats: 2,
        cancelled: false,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.eventRsvp.upsert).toHaveBeenCalledWith({
      where: { eventId_memberId: { eventId: EVENT_ID, memberId: MEMBER_ID } },
      create: { eventId: EVENT_ID, memberId: MEMBER_ID, seats: 2, notes: undefined },
      update: { seats: 2, notes: undefined, cancelledAt: null },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.eventRsvp.upsert.mock.invocationCallOrder[0]!,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/events/member-dinner");
  });

  it("does not write when locked capacity is exhausted", async () => {
    sessionAsMember();
    const tx = makeTx({ capacity: 10, taken: 10 });
    runTransactionWith(tx);

    const result = await rsvpToEvent(INITIAL_RSVP_STATE, formData(1));

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: "This event is full.",
        confirmedSeats: null,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.eventRsvp.upsert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
