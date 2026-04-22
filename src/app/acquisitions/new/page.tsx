import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerAuth } from "@/lib/auth";
import NewAcquisitionForm from "./new-acquisition-form";

export const dynamic = "force-dynamic";

export default async function NewAcquisitionPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=%2Facquisitions%2Fnew");
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      <Link
        href="/acquisitions"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to acquisitions
      </Link>

      <div className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-gold-text mb-2">
          Concierge sourcing
        </p>
        <h1 className="font-serif text-3xl text-primary tracking-wide">
          Request a bottle
        </h1>
        <p className="text-sm text-secondary mt-2">
          Producer is all we need. Everything else helps us focus the hunt.
        </p>
      </div>

      <NewAcquisitionForm />
    </div>
  );
}
