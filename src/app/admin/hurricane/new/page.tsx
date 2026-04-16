import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth";
import { activateProtocol } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewHurricaneProtocolPage() {
  const session = await getServerAuth();
  if (!session?.user?.id) redirect("/auth/login");
  if (session.user.role !== Role.admin && session.user.role !== Role.staff) {
    redirect("/");
  }

  const facilities = await prisma.facility.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      _count: {
        select: {
          members: { where: { member: { hurricaneProtectionActive: true } } },
        },
      },
    },
  });

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      <Link
        href="/admin/hurricane"
        className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to protocols
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Activate protocol</h1>
          <p className="text-sm text-muted">
            Triggered when the NHC issues a watch for a facility&apos;s region
          </p>
        </div>
      </div>

      <form action={activateProtocol} className="glass-card p-6 md:p-8 space-y-5">
        <div>
          <label
            htmlFor="facilityId"
            className="block text-xs uppercase tracking-wider text-muted mb-1.5"
          >
            Facility
          </label>
          <select
            id="facilityId"
            name="facilityId"
            required
            className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
          >
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — {f._count.members} enrolled
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="stormName"
            className="block text-xs uppercase tracking-wider text-muted mb-1.5"
          >
            Storm name
          </label>
          <input
            id="stormName"
            name="stormName"
            type="text"
            required
            placeholder="Elena"
            className="w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="category"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              Category
            </label>
            <select
              id="category"
              name="category"
              className="w-full appearance-none bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
            >
              <option value="">Unknown</option>
              <option value="1">Category 1</option>
              <option value="2">Category 2</option>
              <option value="3">Category 3</option>
              <option value="4">Category 4</option>
              <option value="5">Category 5</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="nhcAdvisory"
              className="block text-xs uppercase tracking-wider text-muted mb-1.5"
            >
              NHC advisory
            </label>
            <input
              id="nhcAdvisory"
              name="nhcAdvisory"
              type="text"
              placeholder="AL112026"
              className="w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="notes"
            className="block text-xs uppercase tracking-wider text-muted mb-1.5"
          >
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Forecast track, expected landfall, coordination notes…"
            className="w-full bg-[#1C1C20]/80 border border-[#2A2A30]/60 rounded-lg px-3 py-2.5 text-sm text-primary focus:outline-none focus:ring-1 focus:ring-gold/40 resize-none"
          />
        </div>

        <p className="text-xs text-muted">
          Activating creates a protocol row and auto-enrolls every member at
          the selected facility with hurricane protection active. The
          protocol starts at <span className="text-primary">Watch issued</span>{" "}
          and advances manually.
        </p>

        <div className="flex gap-3 pt-2">
          <Link
            href="/admin/hurricane"
            className="flex-1 text-center py-2.5 rounded-xl border border-[#2A2A30] text-sm text-secondary hover:text-primary hover:bg-[#1C1C20]/60 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="flex-1 py-2.5 rounded-xl bg-gold text-caveau-black font-semibold text-sm hover:bg-gold/90 transition-colors"
          >
            Activate
          </button>
        </div>
      </form>
    </div>
  );
}
