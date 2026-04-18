import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { getServerAuth } from "@/lib/auth";
import NewEventForm from "./new-event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All events
      </Link>

      <h1 className="font-serif text-2xl text-primary mb-1">New event</h1>
      <p className="text-sm text-muted mb-6">
        Create a tasting, dinner, or festival. Published events appear on the
        public /events page immediately.
      </p>

      <div className="glass-card p-6 md:p-8">
        <NewEventForm />
      </div>
    </div>
  );
}
