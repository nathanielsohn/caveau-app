import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { isFoundingWindowOpen, tierSpecForDbTier } from "@/lib/tiers";
import OnboardingWizard from "./wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.onboarded) redirect("/");

  const member = await prisma.member.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      tier: true,
      lockers: {
        select: {
          lockerNumber: true,
          zone: true,
          facility: { select: { name: true } },
        },
        orderBy: { lockerNumber: "asc" },
        take: 1,
      },
      facilities: {
        select: { facility: { select: { name: true } } },
        take: 1,
      },
      sentinelDevices: {
        where: { installedAt: { not: null }, retiredAt: null },
        select: { serialNumber: true, model: true },
        orderBy: { installedAt: "asc" },
      },
    },
  });

  if (!member) redirect("/auth/login");

  const reservedLockerRow = member.lockers[0] ?? null;
  const reservedLocker = reservedLockerRow
    ? {
        lockerNumber: reservedLockerRow.lockerNumber,
        zone: reservedLockerRow.zone,
      }
    : null;

  // Facility name resolution: prefer the locker's facility once reserved,
  // otherwise fall back to the member's primary facility membership. The
  // signup flow attaches new members to the oldest facility, so this is the
  // same facility the wizard's reserveOnboardingLocker action will pull from.
  const facilityName =
    reservedLockerRow?.facility.name ??
    member.facilities[0]?.facility.name ??
    "your Caveau facility";

  // Resume mid-wizard. Four possible landings:
  //   1 — no locker reserved yet → start at the tier picker.
  //   3 — locker reserved but device step not yet passed (for bundle tiers:
  //       no devices installed; for Collector: the step is advisory but
  //       still needs the user's click, so we default to 3 and let them
  //       continue).
  //   4 — locker reserved and (has devices OR Collector tier just
  //       advanced) → go straight to first-bottle.
  // Collector's step 3 has no DB side effect, so there's no way to
  // distinguish "saw step 3" from "didn't see step 3" without a flag.
  // Default Collector to landing on step 3 on resume so they don't miss
  // the upsell; one extra Continue click is cheaper than a flag column.
  const tierSpec = tierSpecForDbTier(member.tier);
  const bundleCount =
    tierSpec.bundledSentinels + tierSpec.bundledBottleProbes;
  const installedDevices = member.sentinelDevices;

  let initialStep: 1 | 3 | 4 = 1;
  if (reservedLocker) {
    if (bundleCount > 0 && installedDevices.length === 0) {
      initialStep = 3;
    } else if (bundleCount > 0 && installedDevices.length > 0) {
      initialStep = 4;
    } else {
      initialStep = 3; // Collector: show the upsell step on first resume.
    }
  }

  return (
    <OnboardingWizard
      memberName={member.name}
      initialTier={member.tier}
      initialStep={initialStep}
      reservedLocker={reservedLocker}
      facilityName={facilityName}
      foundingWindowOpen={isFoundingWindowOpen()}
      installedDevices={installedDevices}
    />
  );
}
