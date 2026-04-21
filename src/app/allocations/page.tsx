import type { Metadata } from "next";
import Link from "next/link";
import { Gem, Clock, Lock } from "lucide-react";
import {
  AllocationRequestStatus,
  AllocationStatus,
  type Allocation,
  type AllocationRequest,
  type Tier,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import { formatCurrency, toNumber } from "@/lib/utils";
import {
  decideEligibility,
  type MemberEligibilityInput,
} from "@/lib/allocations";

export const metadata: Metadata = {
  title: "Private Allocations · Caveau",
  description:
    "Limited releases and allocated wines curated for Caveau members.",
};

export const dynamic = "force-dynamic";

function tierName(tier: Tier): string {
  return tierSpecForDbTier(tier).name;
}

function closesInCopy(closesAt: Date, now: Date): string {
  const ms = closesAt.getTime() - now.getTime();
  if (ms <= 0) return "Closed";
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return `Closes in ${days} days`;
  if (days === 1) return "Closes in 1 day";
  const hours = Math.max(1, Math.floor(ms / 3600000));
  return `Closes in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export default async function AllocationsListPage() {
  const session = await getServerAuth();
  const now = new Date();

  // Unauthenticated teaser: anonymized preview + sign-in / waitlist CTAs.
  if (!session?.user?.id) {
    const previews = await prisma.allocation.findMany({
      where: {
        status: AllocationStatus.published,
        closesAt: { gte: now },
      },
      orderBy: { opensAt: "asc" },
      take: 3,
      select: {
        id: true,
        producer: true,
        wineName: true,
        vintage: true,
        region: true,
        quantity: true,
        minimumTier: true,
        foundingOnly: true,
      },
    });

    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <Header />
        <div className="glass-card p-6 md:p-10 mb-6">
          <p className="font-serif text-2xl text-primary mb-2">
            Reserved for members.
          </p>
          <p className="text-sm text-secondary mb-6 max-w-xl leading-relaxed">
            Founding Circle members get Day 1 access to private allocations and
            limited releases — DRC, Opus One, Screaming Eagle, and more,
            curated by our sommelier team and sourced through Caveau&apos;s
            private network.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/auth/login?callbackUrl=%2Fallocations"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/waitlist"
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#2A2A30] text-primary text-sm hover:border-gold/40 transition-colors"
            >
              Join the Founding waitlist
            </Link>
          </div>
        </div>

        {previews.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted mb-3 mt-8">
              Recent releases
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {previews.map((a) => (
                <div key={a.id} className="glass-card p-5 opacity-90">
                  <p className="text-[10px] uppercase tracking-widest text-gold-text mb-2">
                    {tierName(a.minimumTier)}
                    {a.foundingOnly ? " · Founding" : ""}
                  </p>
                  <p className="font-serif text-lg text-primary leading-snug">
                    {a.producer}
                  </p>
                  <p className="text-sm text-secondary mt-0.5">
                    {a.wineName} {a.vintage}
                  </p>
                  <p className="text-xs text-muted mt-3">
                    {a.quantity} {a.quantity === 1 ? "bottle" : "bottles"} ·{" "}
                    {a.region}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Authenticated member view.
  const memberId = session.user.id;
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) {
    // Shouldn't happen (middleware enforces auth), but fail gracefully.
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
        <Header />
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            Member record not found. Please sign in again.
          </p>
        </div>
      </div>
    );
  }

  // Show everything still in-window at the member's tier floor AND below —
  // below-tier releases render as locked previews so members understand the
  // ladder. Above-tier releases are hidden entirely.
  const allocations = await prisma.allocation.findMany({
    where: {
      status: AllocationStatus.published,
      closesAt: { gte: now },
    },
    orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
    include: {
      requests: {
        where: { memberId },
        select: {
          id: true,
          status: true,
          quantityRequested: true,
          cancelledAt: true,
        },
      },
      _count: { select: { requests: true } },
    },
  });

  // Second query for claimed-count math: we need all accepted/fulfilled
  // requests across every displayed allocation, regardless of member.
  const allocationIds = allocations.map((a) => a.id);
  const claimedRows = allocationIds.length
    ? await prisma.allocationRequest.findMany({
        where: {
          allocationId: { in: allocationIds },
          status: {
            in: [
              AllocationRequestStatus.accepted,
              AllocationRequestStatus.fulfilled,
            ],
          },
        },
        select: { allocationId: true, quantityRequested: true, status: true },
      })
    : [];
  const claimedByAllocation = new Map<string, number>();
  for (const r of claimedRows) {
    claimedByAllocation.set(
      r.allocationId,
      (claimedByAllocation.get(r.allocationId) ?? 0) + r.quantityRequested,
    );
  }

  const memberInput: MemberEligibilityInput = {
    tier: member.tier,
    foundingMember: member.foundingMember,
  };

  type Row = {
    allocation: (typeof allocations)[number];
    eligible: boolean;
    reason: string;
    remaining: number;
    ownRequest: (typeof allocations)[number]["requests"][number] | null;
  };

  const rows: Row[] = allocations.map((a) => {
    const decision = decideEligibility(memberInput, a, now);
    const remaining = Math.max(
      0,
      a.quantity - (claimedByAllocation.get(a.id) ?? 0),
    );
    const own = a.requests.find((r) => r.status !== AllocationRequestStatus.cancelled);
    return {
      allocation: a,
      eligible: decision.eligible,
      reason: decision.reason,
      remaining,
      ownRequest: own ?? null,
    };
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto">
      <Header />

      {rows.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-sm text-muted">
            No open allocations right now. Your concierge will email you when
            the next release drops.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((row) => (
            <AllocationCard key={row.allocation.id} row={row} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="mb-8">
      <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
        Founding benefit
      </p>
      <h1 className="font-serif text-3xl md:text-4xl text-primary tracking-wide">
        Private Allocations
      </h1>
      <p className="text-sm text-secondary mt-2 max-w-xl">
        Limited releases curated by our sommelier team. Priority access
        for Founding Circle members, then opened to eligible tiers.
      </p>
    </div>
  );
}

function AllocationCard({
  row,
  now,
}: {
  row: {
    allocation: Allocation & {
      requests: Pick<
        AllocationRequest,
        "id" | "status" | "quantityRequested"
      >[];
    };
    eligible: boolean;
    reason: string;
    remaining: number;
    ownRequest: Pick<
      AllocationRequest,
      "id" | "status" | "quantityRequested"
    > | null;
  };
  now: Date;
}) {
  const { allocation: a, eligible, reason, remaining, ownRequest } = row;
  const price = toNumber(a.pricePerBottleUsd);
  const tierLabel = tierName(a.minimumTier);

  return (
    <Link
      href={`/allocations/${a.slug}`}
      className="group glass-card p-6 hover:border-gold/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium">
          <Gem className="w-3.5 h-3.5" />
          {tierLabel}
          {a.foundingOnly ? " · Founding" : ""}
        </div>
        {!eligible && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted">
            <Lock className="w-3 h-3" />
            Locked
          </span>
        )}
      </div>

      <h2 className="font-serif text-xl text-primary group-hover:text-gold-text transition-colors leading-snug">
        {a.producer}
      </h2>
      <p className="text-sm text-secondary mt-0.5">
        {a.wineName} · {a.vintage} · {a.region}
      </p>

      <div className="mt-4 pt-4 border-t border-[#2A2A30]/50 grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">
            Price per bottle
          </p>
          <p className="font-serif text-lg text-primary mt-0.5">
            {formatCurrency(price)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">
            Availability
          </p>
          <p className="font-serif text-lg text-primary mt-0.5">
            {remaining} / {a.quantity}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-[#2A2A30]/50 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Clock className="w-3.5 h-3.5" />
          {closesInCopy(a.closesAt, now)}
        </span>
        {ownRequest ? (
          <span className="text-gold-text font-medium">
            {ownRequestCopy(ownRequest.status, ownRequest.quantityRequested)}
          </span>
        ) : eligible ? (
          <span className="text-gold-text font-medium">
            Request allocation →
          </span>
        ) : (
          <span className="text-muted text-[11px]">{reason}</span>
        )}
      </div>
    </Link>
  );
}

function ownRequestCopy(
  status: AllocationRequestStatus,
  seats: number,
): string {
  const b = (n: number) => `${n} ${n === 1 ? "bottle" : "bottles"}`;
  switch (status) {
    case AllocationRequestStatus.submitted:
      return `Requested · ${b(seats)}`;
    case AllocationRequestStatus.accepted:
      return `Accepted · ${b(seats)}`;
    case AllocationRequestStatus.fulfilled:
      return `Fulfilled · ${b(seats)}`;
    case AllocationRequestStatus.declined:
      return "Declined";
    case AllocationRequestStatus.cancelled:
      return "";
  }
}
