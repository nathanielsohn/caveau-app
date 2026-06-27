import { Cpu, Droplet } from "lucide-react";
import { SentinelModel, WineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";
import { tierSpecForDbTier } from "@/lib/tiers";
import { BatteryBar, ConnectivityPill } from "@/components/device-status-pill";
import PairProbeDialog from "@/app/settings/pair-probe-dialog";

/**
 * Member-facing "Your Sentinel devices" card (feature #59). Read-only
 * view of each installed unit (connectivity, battery, last heartbeat)
 * plus a Bottle Probe pairing action scoped to the caller's in-cellar
 * wines. Heavier admin actions (reassign, firmware, retire) stay on
 * `/admin/sentinels/[id]`.
 *
 * The header line ("{M} of {N} bundled installed") compares the member's
 * tier entitlement (`bundledSentinels + bundledBottleProbes`) against
 * what's actually installed. Purchased add-ons count in the body list
 * but not toward the "of N bundled" ratio — that's why the comparison
 * uses `bundledWithTier` rather than the raw install count.
 */
export default async function SentinelDevicesCard({
  memberId,
}: {
  memberId: string;
}) {
  const [member, devices, pairableWines] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: { tier: true },
    }),
    prisma.sentinelDevice.findMany({
      where: { memberId, retiredAt: null },
      orderBy: [{ model: "asc" }, { installedAt: "asc" }],
      include: {
        facility: { select: { name: true, type: true } },
        locker: { select: { lockerNumber: true, zone: true } },
        wine: {
          select: { id: true, name: true, vintage: true, producer: true },
        },
      },
    }),
    prisma.wine.findMany({
      where: { memberId, status: WineStatus.in_cellar },
      orderBy: { currentValue: "desc" },
      select: { id: true, name: true, vintage: true, producer: true },
    }),
  ]);

  if (!member) return null;

  const tierSpec = tierSpecForDbTier(member.tier);
  const bundleTotal =
    tierSpec.bundledSentinels + tierSpec.bundledBottleProbes;
  const bundleInstalled = devices.filter(
    (d) => d.bundledWithTier !== null && d.installedAt,
  ).length;
  const pendingBundle = Math.max(0, bundleTotal - bundleInstalled);

  const installedCount = devices.filter((d) => d.installedAt).length;

  return (
    <div className="glass-card p-6 md:p-8 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Cpu className="w-4 h-4 text-gold" />
        <h2 className="font-serif text-lg text-primary">Your Sentinel devices</h2>
      </div>
      {bundleTotal > 0 ? (
        <p className="text-xs text-muted mb-6">
          {bundleInstalled} of {bundleTotal} bundled device
          {bundleTotal === 1 ? "" : "s"} installed
          {pendingBundle > 0 && (
            <>
              {" "}
              · {pendingBundle} shipping — will appear here when we add
              another locker to your account
            </>
          )}
          .
        </p>
      ) : (
        <p className="text-xs text-muted mb-6">
          Collector tier includes facility-wide monitoring. Add a Sentinel
          anytime for probe-level telemetry.
        </p>
      )}

      {installedCount === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2A2A30] bg-[#1C1C20]/40 px-4 py-6 text-center">
          <p className="text-sm text-muted">
            No Sentinels installed yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {devices
            .filter((d) => d.installedAt)
            .map((d) => {
              const isProbe = d.model === SentinelModel.bottle_probe;
              const location = d.locker
                ? `${d.facility.name} · Locker #${d.locker.lockerNumber}, Zone ${d.locker.zone}`
                : d.facility.name;
              const modelLabel = isProbe
                ? "Bottle Probe"
                : d.facility.type === "private_location"
                  ? "Sentinel (private location)"
                  : "Sentinel (locker)";
              const pairingText = isProbe
                ? d.wine
                  ? `Paired with ${d.wine.vintage} ${d.wine.name}`
                  : "Bottle Probe — unpaired"
                : null;

              return (
                <li
                  key={d.id}
                  className="rounded-xl border border-[#2A2A30]/60 bg-[#1C1C20]/40 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center text-gold shrink-0">
                      {isProbe ? <Droplet size={16} /> : <Cpu size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-primary font-mono tabular-nums text-sm">
                            {d.serialNumber}
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {modelLabel}
                            {d.bundledWithTier && (
                              <span>
                                {" · "}Bundled ·{" "}
                                {tierSpecForDbTier(d.bundledWithTier).name}
                              </span>
                            )}
                          </div>
                        </div>
                        <ConnectivityPill device={d} />
                      </div>

                      <div className="mt-3 grid gap-1 sm:grid-cols-2">
                        <div className="text-xs text-secondary">
                          <span className="text-muted">Location: </span>
                          {location}
                        </div>
                        <div className="text-xs text-secondary sm:text-right">
                          <span className="text-muted">Last check-in: </span>
                          {d.lastHeartbeatAt
                            ? formatRelativeTime(d.lastHeartbeatAt)
                            : "Never"}
                        </div>
                      </div>

                      {pairingText && (
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#2A2A30]/50 pt-3">
                          <span className="text-xs text-secondary min-w-0 truncate">
                            {pairingText}
                          </span>
                          <PairProbeDialog
                            deviceId={d.id}
                            deviceSerial={d.serialNumber}
                            currentWineId={d.wineId}
                            wines={pairableWines}
                          />
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-3">
                        <BatteryBar batteryPct={d.batteryPct} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
