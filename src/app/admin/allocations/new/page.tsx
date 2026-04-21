import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { getServerAuth } from "@/lib/auth";
import NewAllocationForm from "./new-allocation-form";

export const dynamic = "force-dynamic";

export default async function NewAllocationPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin) redirect("/");

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      <Link
        href="/admin/allocations"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to allocations
      </Link>

      <h1 className="font-serif text-2xl text-primary mb-1">
        New allocation
      </h1>
      <p className="text-sm text-muted mb-6">
        Private release. Eligible members see it the moment it&apos;s
        published.
      </p>

      <NewAllocationForm />
    </div>
  );
}
