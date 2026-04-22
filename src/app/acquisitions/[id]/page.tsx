import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Package, ShieldCheck, Wine } from "lucide-react";
import { AcquisitionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import {
  formatAcquisitionSpec,
  isMemberCancellable,
  MEMBER_STATUS_COPY,
  SOURCE_LABELS,
} from "@/lib/acquisitions";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import CancelRequestButton from "./cancel-request-button";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<AcquisitionStatus, string> = {
  requested: "bg-gold/10 text-gold border-gold/30",
  sourcing: "bg-ok/10 text-ok border-ok/30",
  fulfilled: "bg-ok/10 text-ok border-ok/30",
  declined: "bg-muted/10 text-muted border-muted/20",
  cancelled: "bg-muted/10 text-muted border-muted/20",
};

export default async function AcquisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  const memberId = session.user.id;

  const { id } = await params;
  const acquisition = await prisma.acquisition.findFirst({
    where: { id, memberId },
    include: {
      sourcedWines: {
        select: {
          id: true,
          name: true,
          producer: true,
          vintage: true,
          currentValue: true,
        },
      },
    },
  });
  if (!acquisition) notFound();

  const spec = formatAcquisitionSpec(acquisition);
  const cancellable = isMemberCancellable(acquisition.status);

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/acquisitions"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to acquisitions
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium ${STATUS_STYLES[acquisition.status]}`}
          >
            {MEMBER_STATUS_COPY[acquisition.status]}
          </span>
          <span className="text-[11px] text-muted">
            Submitted {formatDate(acquisition.createdAt)}
          </span>
        </div>

        <h1 className="font-serif text-3xl text-primary tracking-wide mb-4">
          {spec}
        </h1>

        {/* Status copy block */}
        <StatusCopy status={acquisition.status} />

        {/* Pricing */}
        {(acquisition.estimatedTotalUsd || acquisition.memberPriceUsd) && (
          <div className="glass-card p-6">
            <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
              Pricing
            </p>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {acquisition.estimatedTotalUsd && !acquisition.memberPriceUsd && (
                <div>
                  <dt className="text-xs text-muted mb-1">Working quote</dt>
                  <dd className="font-serif text-lg text-primary">
                    {formatCurrency(toNumber(acquisition.estimatedTotalUsd))}
                  </dd>
                </div>
              )}
              {acquisition.memberPriceUsd && (
                <div>
                  <dt className="text-xs text-muted mb-1">Your price</dt>
                  <dd className="font-serif text-lg text-primary">
                    {formatCurrency(toNumber(acquisition.memberPriceUsd))}
                  </dd>
                </div>
              )}
              {acquisition.source && (
                <div>
                  <dt className="text-xs text-muted mb-1">Source</dt>
                  <dd className="text-primary">
                    {SOURCE_LABELS[acquisition.source]}
                  </dd>
                </div>
              )}
              {acquisition.fulfilledAt && (
                <div>
                  <dt className="text-xs text-muted mb-1">Fulfilled</dt>
                  <dd className="text-primary">
                    {formatDate(acquisition.fulfilledAt)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Request details */}
        <div className="glass-card p-6">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-3">
            Request details
          </p>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted mb-1">Quantity</dt>
              <dd className="text-primary">
                {acquisition.quantity}{" "}
                {acquisition.quantity === 1 ? "bottle" : "bottles"}
              </dd>
            </div>
            {acquisition.maxBudgetUsd && (
              <div>
                <dt className="text-xs text-muted mb-1">Budget cap</dt>
                <dd className="text-primary">
                  {formatCurrency(toNumber(acquisition.maxBudgetUsd))}
                </dd>
              </div>
            )}
            {acquisition.region && (
              <div>
                <dt className="text-xs text-muted mb-1">Region</dt>
                <dd className="text-primary">{acquisition.region}</dd>
              </div>
            )}
            {acquisition.varietal && (
              <div>
                <dt className="text-xs text-muted mb-1">Varietal</dt>
                <dd className="text-primary">{acquisition.varietal}</dd>
              </div>
            )}
          </dl>

          {acquisition.memberNote && (
            <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
              <p className="text-xs text-muted mb-1">Your note</p>
              <p className="text-sm text-secondary italic">
                &ldquo;{acquisition.memberNote}&rdquo;
              </p>
            </div>
          )}

          {acquisition.staffNote && (
            <div className="mt-4 pt-4 border-t border-[#2A2A30]/50">
              <p className="text-xs text-muted mb-1">Note from sourcing</p>
              <p className="text-sm text-secondary">
                {acquisition.staffNote}
              </p>
            </div>
          )}
        </div>

        {/* Sourced wines */}
        {acquisition.sourcedWines.length > 0 && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-2 mb-3">
              <Wine className="w-4 h-4 text-gold" />
              <p className="text-[10px] uppercase tracking-widest text-gold-text">
                In your collection
              </p>
            </div>
            <ul className="space-y-2">
              {acquisition.sourcedWines.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between gap-4 text-sm py-2 border-b border-[#2A2A30]/30 last:border-0"
                >
                  <Link
                    href={`/wine/${w.id}`}
                    className="text-primary hover:text-gold transition-colors truncate"
                  >
                    {w.vintage} {w.producer} — {w.name}
                  </Link>
                  <span className="text-secondary flex-shrink-0">
                    {formatCurrency(toNumber(w.currentValue))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {cancellable && <CancelRequestButton acquisitionId={acquisition.id} />}

        <div className="glass-card p-6">
          <div className="flex items-start gap-3 mb-2">
            <ShieldCheck className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
            <p className="font-serif text-lg text-primary">
              What&apos;s included
            </p>
          </div>
          <p className="text-sm text-secondary leading-relaxed">
            Every sourced bottle lands in your Caveau locker with an
            intake-to-date Caveau Custody & Condition Report, first-day
            Sentinel coverage, and full integration with your portfolio
            valuations and exit signals.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusCopy({ status }: { status: AcquisitionStatus }) {
  if (status === AcquisitionStatus.cancelled) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-secondary">
          This request was cancelled. Start a new one from{" "}
          <Link
            href="/acquisitions/new"
            className="text-gold hover:text-gold/80"
          >
            the request form
          </Link>
          .
        </p>
      </div>
    );
  }
  if (status === AcquisitionStatus.declined) {
    return (
      <div className="glass-card p-6">
        <p className="text-sm text-secondary">
          We couldn&apos;t source this one — see the note from sourcing
          below for detail. Feel free to submit a revised brief any time.
        </p>
      </div>
    );
  }
  if (status === AcquisitionStatus.fulfilled) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-start gap-3 mb-2">
          <Package className="w-5 h-5 text-ok flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-ok mb-1">
              Fulfilled
            </p>
            <p className="font-serif text-lg text-primary">
              In your cellar
            </p>
          </div>
        </div>
        <p className="text-sm text-secondary leading-relaxed">
          The bottle is in your locker with a Caveau Custody & Condition
          Report issued at intake.
        </p>
      </div>
    );
  }
  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-3 mb-2">
        <Clock className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-1">
            {status === AcquisitionStatus.requested ? "In review" : "Sourcing"}
          </p>
          <p className="font-serif text-lg text-primary">
            {status === AcquisitionStatus.requested
              ? "Awaiting our sommeliers"
              : "Working the brokers + auctions"}
          </p>
        </div>
      </div>
      <p className="text-sm text-secondary leading-relaxed">
        {status === AcquisitionStatus.requested
          ? "We'll confirm scope and come back with a working quote within two business days."
          : "We're scanning Liv-ex, our broker network, and active auctions. You'll see a quote here the moment we've got one."}
      </p>
    </div>
  );
}
