/**
 * Member-side delivery ladder page (feature #51).
 *
 * Reads the DeliveryRequest for the authed member and derives which ladder
 * step the client should open at. Resume-aware — refreshing mid-flow or
 * revisiting a completed delivery lands in the right place without the
 * client having to guess.
 */
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { UuidSchema } from "@/lib/schemas";
import LadderClient, { type DeliveryView, type DeliveryStepKey } from "./ladder-client";

export const dynamic = "force-dynamic";

function deriveStep(
  status: string,
  isBiometricVerified: boolean,
  otpRequired: boolean,
  isExpired: boolean,
): DeliveryStepKey {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  if (status === "expired" || isExpired) return "expired";
  // otp_verified, handoff_started, id_scanned all mean the member side is
  // done — render "ready for handoff" until the door ladder closes out the
  // request in Step 3.
  if (
    status === "otp_verified" ||
    status === "handoff_started" ||
    status === "id_scanned"
  ) {
    return "ready";
  }
  if (!isBiometricVerified) return "biometric";
  if (status === "requested") return "pin";
  if (status === "pin_entered") return "address";
  if (status === "address_confirmed") {
    return otpRequired ? "otp" : "ready";
  }
  return "biometric";
}

export default async function DeliveryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ showPin?: string | string[] }>;
}) {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id: rawId } = await params;
  const idParse = UuidSchema.safeParse(rawId);
  if (!idParse.success) notFound();
  const id = idParse.data;

  // One-shot PIN: the Deliver Now button redirects here with ?showPin=<pin>
  // after creating the request. The client strips the query on mount via
  // router.replace so a refresh doesn't resurface the PIN. We only accept
  // a 4-digit numeric string so a tampered URL can't inject arbitrary text.
  const rawShowPin = (await searchParams).showPin;
  const showPinCandidate = Array.isArray(rawShowPin) ? rawShowPin[0] : rawShowPin;
  const showPin =
    showPinCandidate && /^\d{4}$/.test(showPinCandidate) ? showPinCandidate : null;

  const delivery = await prisma.deliveryRequest.findFirst({
    where: { id, memberId: session.user.id },
    select: {
      id: true,
      status: true,
      isBiometricVerified: true,
      otpRequired: true,
      deliveryAddressLine1: true,
      deliveryAddressLine2: true,
      deliveryCity: true,
      deliveryState: true,
      deliveryPostalCode: true,
      expiresAt: true,
      pinVerifiedAt: true,
      otpVerifiedAt: true,
      cancelledAt: true,
      completedAt: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          wine: {
            select: {
              id: true,
              name: true,
              vintage: true,
              producer: true,
              currentValue: true,
            },
          },
        },
      },
    },
  });
  if (!delivery) notFound();

  const now = Date.now();
  const isExpired =
    delivery.expiresAt.getTime() < now &&
    delivery.status !== "completed" &&
    delivery.status !== "cancelled" &&
    delivery.status !== "expired";

  const currentStep = deriveStep(
    delivery.status,
    delivery.isBiometricVerified,
    delivery.otpRequired,
    isExpired,
  );

  const totalValueUsd = delivery.items.reduce(
    (acc, it) => acc + Number(it.wine.currentValue),
    0,
  );

  const view: DeliveryView = {
    id: delivery.id,
    status: delivery.status,
    isBiometricVerified: delivery.isBiometricVerified,
    otpRequired: delivery.otpRequired,
    expiresAt: delivery.expiresAt.toISOString(),
    createdAt: delivery.createdAt.toISOString(),
    pinVerifiedAt: delivery.pinVerifiedAt?.toISOString() ?? null,
    otpVerifiedAt: delivery.otpVerifiedAt?.toISOString() ?? null,
    cancelledAt: delivery.cancelledAt?.toISOString() ?? null,
    completedAt: delivery.completedAt?.toISOString() ?? null,
    address: {
      line1: delivery.deliveryAddressLine1,
      line2: delivery.deliveryAddressLine2,
      city: delivery.deliveryCity,
      state: delivery.deliveryState,
      postalCode: delivery.deliveryPostalCode,
    },
    items: delivery.items.map((it) => ({
      id: it.id,
      wineId: it.wine.id,
      name: it.wine.name,
      vintage: it.wine.vintage,
      producer: it.wine.producer,
      currentValue: Number(it.wine.currentValue),
    })),
    totalValueUsd,
    isExpired,
  };

  const memberEmail = session.user.email ?? "";

  return (
    <LadderClient
      delivery={view}
      initialStep={currentStep}
      memberEmail={memberEmail}
      showPin={showPin}
    />
  );
}
