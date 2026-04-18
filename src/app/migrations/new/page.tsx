import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import NewMigrationForm from "./new-migration-form";

export const dynamic = "force-dynamic";

export default async function NewMigrationPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/migrations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All migrations
      </Link>

      <h1 className="font-serif text-2xl text-primary mb-1">
        Start a migration
      </h1>
      <p className="text-sm text-muted mb-6 max-w-prose">
        Export your collection from CellarTracker or Vivino as a CSV, then drop
        it below. We&apos;ll auto-detect the columns; you can adjust before our
        concierge team fulfills within 48 hours.
      </p>

      <div className="glass-card p-6 md:p-8">
        <NewMigrationForm />
      </div>
    </div>
  );
}
