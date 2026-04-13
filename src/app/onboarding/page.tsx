import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
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
        select: { lockerNumber: true, zone: true },
        orderBy: { lockerNumber: "asc" },
        take: 1,
      },
    },
  });

  if (!member) redirect("/auth/login");

  const reservedLocker = member.lockers[0] ?? null;

  // Resume mid-wizard: if a previous attempt already reserved a locker,
  // skip past tier + reservation and land on the first-bottle step.
  const initialStep: 1 | 3 = reservedLocker ? 3 : 1;

  return (
    <OnboardingWizard
      memberName={member.name}
      initialTier={member.tier}
      initialStep={initialStep}
      reservedLocker={reservedLocker}
    />
  );
}

