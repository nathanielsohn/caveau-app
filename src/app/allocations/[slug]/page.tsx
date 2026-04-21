import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Gem, Lock, ShieldCheck } from "lucide-react";
import {
  AllocationRequestStatus,
  AllocationStatus,
  type AllocationRequest,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import { getPublicUrl } from "@/lib/s3";
import {
  decideEligibility,
  bottlesRemaining,
  maxRequestQuantity,
  type MemberEligibilityInput,
} from "@/lib/allocations";
import RequestForm from "./request-form";
import CancelRequestButton from "./cancel-request-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await prisma.allocation.findUnique({
    where: { slug },
    select: { producer: true, wineName: true, vintage: true, status: true },
  });
  if (!a || a.status === AllocationStatus.draft) {
    return { title: "Allocation · Caveau" };
  }
  return {
    title: `${a.producer} ${a.wineName} ${a.vintage} · Caveau`,
  };
}

export default async function AllocationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getServerAuth();
  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=%2Fallocations%2F${encodeURIComponent(slug)}`);
  }
  const memberId = session.user.id;

  const allocation = await prisma.allocation.findUnique({
    where: { slug },
    include: {
      requests: {
        select: {
          id: true,
          memberId: true,
          status: true,
          quantityRequested: true,
        },
      },
    },
  });
  if (!allocation || allocation.status === AllocationStatus.draft) notFound();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { tier: true, foundingMember: true },
  });
  if (!member) notFound();

  const memberInput: MemberEligibilityInput = {
    tier: member.tier,
    foundingMember: member.foundingMember,
  };
  const now = new Date();
  const decision = decideEligibility(memberInput, allocation, now);

  const remaining = bottlesRemaining(allocation, allocation.requests);
  const maxQty = maxRequestQuantity(allocation, allocation.requests);

  const ownRequest: (typeof allocation)["requests"][number] | null =
    allocation.requests.find(
      (r) =>
        r.memberId === memberId &&
        r.status !== AllocationRequestStatus.cancelled,
    ) ?? null;

  const price = toNumber(allocation.pricePerBottleUsd);
  const tierSpec = tierSpecForDbTier(allocation.minimumTier);
  const heroUrl = getPublicUrl(allocation.heroImageKey);

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/allocations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All allocations
      </Link>

      <div className="glass-card overflow-hidden mb-6">
        {heroUrl && (
          <div className="relative w-full aspect-[16/7] bg-caveau-graphite">
            <Image
              src={heroUrl}
              alt={`${allocation.producer} ${allocation.wineName}`}
              fill
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="p-6 md:p-10">
          <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold text-xs font-medium">
              <Gem className="w-3.5 h-3.5" />
              {tierSpec.name}
              {allocation.foundingOnly ? " · Founding" : ""}
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <Clock className="w-3.5 h-3.5" />
              Closes {formatDate(allocation.closesAt)}
            </span>
          </div>

          <h1 className="font-serif text-3xl md:text-4xl text-primary leading-tight">
            {allocation.producer}
          </h1>
          <p className="font-serif text-xl text-secondary mt-1">
            {allocation.wineName} · {allocation.vintage}
          </p>
          <p className="text-xs text-muted mt-1">
            {allocation.region} · {allocation.varietal}
          </p>

          {allocation.description && (
            <p className="text-secondary mt-5 leading-relaxed whitespace-pre-line">
              {allocation.description}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-[#2A2A30]/50">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Price per bottle
              </p>
              <p className="font-serif text-xl text-primary mt-1">
                {formatCurrency(price)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Availability
              </p>
              <p className="font-serif text-xl text-primary mt-1">
                {remaining} of {allocation.quantity}
              </p>
              <p className="text-[11px] text-muted mt-0.5">
                {allocation.quantity === 1 ? "bottle" : "bottles"} open
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted">
                Eligibility
              </p>
              <p className="text-sm text-primary mt-1 inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                {tierSpec.name}
                {allocation.foundingOnly ? " · Founding" : " and above"}
              </p>
              {allocation.foundingEarlyAccess && (
                <p className="text-[11px] text-gold-text mt-0.5">
                  Founding early access
                </p>
              )}
            </div>
          </div>

          {allocation.tastingNotes && (
            <div className="mt-6 pt-6 border-t border-[#2A2A30]/50">
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">
                Tasting notes
              </p>
              <p className="text-sm text-secondary leading-relaxed whitespace-pre-line">
                {allocation.tastingNotes}
              </p>
            </div>
          )}
        </div>
      </div>

      {ownRequest ? (
        <OwnRequestCard
          request={ownRequest}
          allocationId={allocation.id}
          pricePerBottleUsd={price}
        />
      ) : decision.eligible ? (
        maxQty > 0 ? (
          <RequestForm allocationId={allocation.id} maxQuantity={maxQty} />
        ) : (
          <div className="glass-card p-6 md:p-8 text-center">
            <p className="font-serif text-xl text-primary mb-2">
              Fully allocated.
            </p>
            <p className="text-sm text-secondary">
              This release is spoken for. Your concierge can tip you off when
              the next one drops.
            </p>
          </div>
        )
      ) : (
        <div className="glass-card p-6 md:p-8">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-muted mt-1 flex-shrink-0" />
            <div>
              <p className="font-serif text-lg text-primary mb-1">
                Not open to your tier yet
              </p>
              <p className="text-sm text-secondary">{decision.reason}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OwnRequestCard({
  request,
  allocationId,
  pricePerBottleUsd,
}: {
  request: Pick<AllocationRequest, "id" | "status" | "quantityRequested">;
  allocationId: string;
  pricePerBottleUsd: number;
}) {
  const qty = request.quantityRequested;
  const total = pricePerBottleUsd * qty;

  if (request.status === AllocationRequestStatus.fulfilled) {
    return (
      <div className="glass-card p-6 md:p-8">
        <p className="text-[10px] uppercase tracking-widest text-ok mb-2">
          Fulfilled
        </p>
        <p className="font-serif text-xl text-primary mb-1">
          {qty} {qty === 1 ? "bottle" : "bottles"} acquired.
        </p>
        <p className="text-sm text-secondary mb-5">
          View the {qty === 1 ? "bottle" : "bottles"} in your collection — now
          under Caveau custody.
        </p>
        <Link
          href="/collection"
          className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
        >
          Open collection
        </Link>
      </div>
    );
  }

  const statusCopy =
    request.status === AllocationRequestStatus.submitted
      ? {
          label: "Requested",
          heading: `${qty} ${qty === 1 ? "bottle" : "bottles"} requested.`,
          body: "Your concierge will confirm within 48 hours. You'll be notified by email.",
          tone: "text-gold",
        }
      : request.status === AllocationRequestStatus.accepted
        ? {
            label: "Accepted",
            heading: `${qty} ${qty === 1 ? "bottle" : "bottles"} reserved for you.`,
            body: `Approximate total: ${formatCurrency(total)}. Caveau will follow up with payment instructions.`,
            tone: "text-ok",
          }
        : {
            label: "Declined",
            heading: "This request was declined.",
            body: "Reach out to your concierge for context.",
            tone: "text-muted",
          };

  return (
    <div className="glass-card p-6 md:p-8">
      <p
        className={`text-[10px] uppercase tracking-widest mb-2 ${statusCopy.tone}`}
      >
        {statusCopy.label}
      </p>
      <p className="font-serif text-xl text-primary mb-1">
        {statusCopy.heading}
      </p>
      <p className="text-sm text-secondary mb-5">{statusCopy.body}</p>
      {request.status !== AllocationRequestStatus.declined && (
        <CancelRequestButton
          requestId={request.id}
          allocationId={allocationId}
        />
      )}
    </div>
  );
}
