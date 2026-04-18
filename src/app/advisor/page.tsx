import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth";
import { tierSpecForDbTier } from "@/lib/tiers";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  const memberName = session.user.name ?? "Member";
  const tierSlug = tierSpecForDbTier(session.user.tier).slug;

  return <ChatClient memberName={memberName} tierSlug={tierSlug} />;
}
