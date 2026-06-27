import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import {
  CreatePrivateLocationForm,
  PrivateLocationCard,
  type PrivateLocationCardData,
} from "./location-forms";

export const dynamic = "force-dynamic";

export default async function SettingsLocationsPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const [vaultMemberships, privateLocations] = await Promise.all([
    prisma.facilityMember.findMany({
      where: { memberId: session.user.id, facility: { type: "vault" } },
      orderBy: { facility: { name: "asc" } },
      select: {
        facility: {
          select: {
            id: true,
            name: true,
            location: true,
            elevationFt: true,
            _count: { select: { lockers: true } },
          },
        },
      },
    }),
    prisma.facility.findMany({
      where: { type: "private_location", ownerMemberId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        location: true,
        privateLocationKind: true,
        elevationFt: true,
        privateLocationCertifiedAt: true,
        locationInstaller: { select: { name: true } },
        lockers: {
          select: {
            _count: {
              select: {
                slots: true,
                readings: true,
                alerts: true,
                sentinelDevices: true,
              },
            },
          },
        },
        _count: {
          select: {
            sentinelDevices: true,
            events: true,
            hurricaneProtocols: true,
            tastingEvents: true,
          },
        },
      },
    }),
  ]);

  const privateLocationCards: PrivateLocationCardData[] = privateLocations.map(
    (location) => {
      const hasHistory =
        Boolean(location.privateLocationCertifiedAt) ||
        location._count.sentinelDevices > 0 ||
        location._count.events > 0 ||
        location._count.hurricaneProtocols > 0 ||
        location._count.tastingEvents > 0 ||
        location.lockers.some(
          (locker) =>
            locker._count.slots > 0 ||
            locker._count.readings > 0 ||
            locker._count.alerts > 0 ||
            locker._count.sentinelDevices > 0,
        );

      return {
        id: location.id,
        name: location.name,
        location: location.location,
        privateLocationKind: location.privateLocationKind,
        elevationFt: location.elevationFt,
        certifiedAtLabel: location.privateLocationCertifiedAt
          ? formatDate(location.privateLocationCertifiedAt)
          : null,
        installerName: location.locationInstaller?.name ?? null,
        deviceCount: location._count.sentinelDevices,
        canRemove: !hasHistory,
      };
    },
  );

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Settings
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <MapPin className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Locations</h1>
          <p className="text-sm text-muted">
            Manage vault memberships and private monitoring locations
          </p>
        </div>
      </div>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Caveau vaults</h2>
        </div>
        {vaultMemberships.length === 0 ? (
          <div className="glass-card p-6">
            <p className="text-sm text-muted">
              No vault memberships are attached to this account yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vaultMemberships.map(({ facility }) => (
              <div key={facility.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-serif text-lg text-primary truncate">
                      {facility.name}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {facility.location}
                    </p>
                    <p className="text-xs text-secondary mt-2">
                      {facility._count.lockers} locker
                      {facility._count.lockers === 1 ? "" : "s"} at this vault
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-gold/30 bg-gold/10 text-gold text-xs font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Vault
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BadgeCheck className="w-4 h-4 text-gold" />
          <h2 className="font-serif text-lg text-primary">Private locations</h2>
        </div>
        {privateLocationCards.length === 0 ? (
          <div className="glass-card p-6">
            <p className="text-sm text-muted">
              Add residences, restaurants, retail rooms, warehouses, or other
              client-controlled spaces for Sentinel monitoring.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {privateLocationCards.map((location) => (
              <PrivateLocationCard key={location.id} location={location} />
            ))}
          </div>
        )}
      </section>

      <CreatePrivateLocationForm />
    </div>
  );
}
