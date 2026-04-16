import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Eye,
  ExternalLink,
  Package,
  Share2,
  Clock,
  Wine as WineIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate, formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  auction: "Auction",
  broker: "Broker",
  private: "Private",
};

const CHANNEL_STYLES: Record<string, string> = {
  auction: "bg-gold/10 text-gold border-gold/20",
  broker: "bg-[#60A5FA]/10 text-[#60A5FA] border-[#60A5FA]/20",
  private: "bg-burgundy/10 text-burgundy border-burgundy/20",
};

export default async function HandoffListPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const packages = await prisma.handoffPackage.findMany({
    where: { memberId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      wine: {
        select: { id: true, name: true, vintage: true, producer: true },
      },
      _count: { select: { accesses: true } },
    },
  });

  const now = Date.now();

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-gold-text mb-2">
          <Share2 size={14} />
          <span className="text-[11px] uppercase tracking-[0.2em]">
            Handoff
          </span>
        </div>
        <h1 className="font-serif text-2xl md:text-3xl text-primary">
          Shared Packages
        </h1>
        <p className="text-sm text-secondary mt-2 max-w-2xl">
          Every shareable bundle you&apos;ve sent to an auction house, broker,
          or private buyer. Each link bundles the custody certificate, Sentinel
          history, current Liv-ex valuation, and bottle photo.
        </p>
      </header>

      {packages.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Package
            className="w-12 h-12 text-muted/40 mx-auto mb-3"
            strokeWidth={1}
          />
          <p className="text-secondary text-sm mb-1">
            No handoff packages yet
          </p>
          <p className="text-muted text-xs">
            Open your collection and tap the share icon on any bottle to
            generate a recipient-ready link.
          </p>
          <Link
            href="/collection"
            className="inline-block mt-4 text-gold text-sm hover:underline"
          >
            Go to Collection →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {packages.map((pkg) => {
            const expired =
              pkg.expiresAt != null && pkg.expiresAt.getTime() < now;
            const channelLabel =
              CHANNEL_LABELS[pkg.channel] ?? pkg.channel;
            const channelStyle =
              CHANNEL_STYLES[pkg.channel] ?? "bg-caveau-graphite text-secondary border-[#2A2A30]";
            return (
              <div
                key={pkg.id}
                className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                {/* Wine info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-caveau-graphite flex items-center justify-center flex-shrink-0">
                    <WineIcon
                      className="w-5 h-5 text-burgundy/60"
                      strokeWidth={1.2}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/wine/${pkg.wine.id}`}
                      className="font-serif text-sm text-primary truncate hover:text-gold transition-colors block"
                    >
                      {pkg.wine.name}
                    </Link>
                    <p className="text-xs text-secondary truncate">
                      {pkg.wine.vintage} &middot; {pkg.wine.producer}
                    </p>
                  </div>
                </div>

                {/* Recipient + channel */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted uppercase tracking-wider mb-0.5">
                    Recipient
                  </p>
                  <p className="text-sm text-primary truncate">
                    {pkg.recipientName}
                  </p>
                  <p className="text-[11px] text-secondary truncate">
                    {pkg.recipientEmail}
                  </p>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap ${channelStyle}`}
                  >
                    {channelLabel}
                  </span>

                  <div className="flex items-center gap-1.5 text-secondary">
                    <Eye size={14} />
                    <span className="text-sm font-medium text-primary tabular-nums">
                      {pkg._count.accesses}
                    </span>
                    <span className="text-[11px] text-muted hidden sm:inline">
                      view{pkg._count.accesses === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-secondary whitespace-nowrap">
                    <Clock size={14} />
                    <span className="text-[11px] text-muted">
                      {formatRelativeTime(pkg.createdAt)}
                    </span>
                  </div>

                  {expired ? (
                    <span className="text-[11px] text-danger whitespace-nowrap">
                      Expired {formatDate(pkg.expiresAt!)}
                    </span>
                  ) : pkg.expiresAt ? (
                    <span className="text-[11px] text-muted whitespace-nowrap hidden md:inline">
                      exp. {formatDate(pkg.expiresAt)}
                    </span>
                  ) : null}

                  <Link
                    href={`/handoff/${pkg.shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open shared package"
                    className="text-gold hover:text-gold-text transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                  >
                    <ExternalLink size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
