import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { isFoundingWindowOpen } from "@/lib/tiers";
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

  // Resume mid-wizard: if a previous attempt already reserved a locker,
  // skip past tier + reservation and land on the first-bottle step.
  const initialStep: 1 | 3 = reservedLocker ? 3 : 1;

  return (
    <OnboardingWizard
      memberName={member.name}
      initialTier={member.tier}
      initialStep={initialStep}
      reservedLocker={reservedLocker}
      facilityName={facilityName}
      foundingWindowOpen={isFoundingWindowOpen()}
    />
  );
}

