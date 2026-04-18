/**
 * Driver-side handoff page (feature #51, Step 3).
 *
 * Public, token-bearing URL the Caveau courier opens on their phone. No
 * auth — the 256-bit driverToken IS the bearer credential. The token is
 * generated on the final member-side transition (see /address and /otp
 * routes), so reaching this page means the member has cleared every
 * verification gate on their side.
 *
 * Three terminal views (not-found / expired / cancelled / completed) short
 * out the ladder; otherwise the client ladder resumes at the right step
 * based on the delivery's current status.
 */
import { XCircle, CheckCircle2, Clock } from "lucide-react";
import {
  DRIVER_TOKEN_PATTERN,
  loadDeliveryByDriverToken,
  type DriverBundle,
} from "@/lib/delivery";
import LadderClient, {
  type DriverStepKey,
  type DriverView,
} from "./ladder-client";

export const dynamic = "force-dynamic";

function deriveStep(
  status: DriverBundle["delivery"]["status"],
  isExpired: boolean,
): DriverStepKey {
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "expired" || isExpired) return "expired";
  if (status === "address_confirmed" || status === "otp_verified") return "start";
  if (status === "handoff_started") return "id-scan";
  if (status === "id_scanned") return "photo";
  // Anything earlier than address_confirmed means the member hasn't finished
  // their side yet — a driver should never see this (no token would exist),
  // but fall back to the start step so the UI at least renders something
  // sensible rather than throwing.
  return "start";
}

export default async function HandoffDriverPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!DRIVER_TOKEN_PATTERN.test(token)) return <NotFoundView />;

  const bundle = await loadDeliveryByDriverToken(token);
  if (!bundle) return <NotFoundView />;

  const { delivery, member, items, recipients } = bundle;
  const now = Date.now();
  const isTerminal =
    delivery.status === "completed" ||
    delivery.status === "cancelled" ||
    delivery.status === "expired";
  const isExpired = delivery.expiresAt.getTime() < now && !isTerminal;

  if (delivery.status === "cancelled") {
    return (
      <TerminalView
        icon={<XCircle size={40} className="text-danger" />}
        title="Delivery cancelled"
        body="The member cancelled this delivery. Do not proceed — return to dispatch."
        tone="danger"
      />
    );
  }
  if (delivery.status === "completed") {
    return (
      <TerminalView
        icon={<CheckCircle2 size={40} className="text-gold" />}
        title="Handoff already logged"
        body="This delivery has already been completed. No further action required."
        tone="gold"
      />
    );
  }
  if (isExpired || delivery.status === "expired") {
    return (
      <TerminalView
        icon={<Clock size={40} className="text-muted" />}
        title="Delivery window closed"
        body="This delivery token is past its expiration. Contact dispatch for a fresh handoff."
        tone="muted"
      />
    );
  }

  const currentStep = deriveStep(delivery.status, isExpired);

  const view: DriverView = {
    token,
    deliveryId: delivery.id,
    status: delivery.status,
    otpRequired: delivery.otpRequired,
    memberName: member.name,
    address: {
      line1: delivery.deliveryAddressLine1,
      line2: delivery.deliveryAddressLine2,
      city: delivery.deliveryCity,
      state: delivery.deliveryState,
      postalCode: delivery.deliveryPostalCode,
    },
    items: items.map((it) => ({
      id: it.id,
      name: it.name,
      vintage: it.vintage,
      producer: it.producer,
    })),
    recipients: recipients.map((r) => ({
      id: r.id,
      name: r.name,
      relationship: r.relationship,
    })),
  };

  return <LadderClient view={view} initialStep={currentStep} />;
}

function NotFoundView() {
  return (
    <TerminalView
      icon={<XCircle size={40} className="text-danger" />}
      title="Handoff not found"
      body="This driver link is invalid or has been revoked. Contact dispatch."
      tone="danger"
    />
  );
}

function TerminalView({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "gold" | "danger" | "muted";
}) {
  const ringClass =
    tone === "gold"
      ? "bg-gold/10 border-gold/20"
      : tone === "danger"
        ? "bg-danger/10 border-danger/20"
        : "bg-[#1C1C20] border-[#2A2A30]";
  return (
    <div className="min-h-screen bg-caveau-black text-primary flex flex-col items-center justify-center px-4 py-12">
      <div className="text-gold text-5xl mb-8">◈</div>
      <div className="max-w-md w-full text-center">
        <div
          className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 border ${ringClass}`}
        >
          {icon}
        </div>
        <h1 className="font-serif text-2xl sm:text-3xl text-primary mb-2">
          {title}
        </h1>
        <p className="text-sm text-secondary">{body}</p>
      </div>
    </div>
  );
}
