import { Lock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import ReassignForm from "./reassign-form";

export const dynamic = "force-dynamic";

export default async function AdminLockersPage() {
  const [lockers, facilityMembers] = await Promise.all([
    prisma.locker.findMany({
      orderBy: [{ facility: { name: "asc" } }, { lockerNumber: "asc" }],
      include: {
        facility: { select: { id: true, name: true } },
        member: { select: { id: true, name: true } },
        _count: { select: { slots: true } },
        slots: { where: { wineId: { not: null } }, select: { id: true } },
      },
    }),
    prisma.facilityMember.findMany({
      include: {
        member: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Build a facility → member[] map so each row's dropdown only shows
  // people actually enrolled at that facility.
  const membersByFacility = new Map<string, { id: string; name: string }[]>();
  for (const fm of facilityMembers) {
    const list = membersByFacility.get(fm.facilityId) ?? [];
    list.push(fm.member);
    membersByFacility.set(fm.facilityId, list);
  }
  membersByFacility.forEach((list) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
  });

  const totalSlots = lockers.reduce((sum, l) => sum + l._count.slots, 0);
  const occupiedSlots = lockers.reduce((sum, l) => sum + l.slots.length, 0);
  const assignedLockers = lockers.filter((l) => l.memberId !== null).length;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
          <Lock className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="font-serif text-2xl text-primary">Lockers</h1>
          <p className="text-sm text-muted">
            {lockers.length} total · {assignedLockers} assigned ·{" "}
            {occupiedSlots}/{totalSlots} slots occupied
          </p>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-[#2A2A30]/60">
              <th className="px-4 py-3 font-medium">Facility</th>
              <th className="px-4 py-3 font-medium">Locker</th>
              <th className="px-4 py-3 font-medium">Zone</th>
              <th className="px-4 py-3 font-medium">Occupancy</th>
              <th className="px-4 py-3 font-medium">Assigned to</th>
            </tr>
          </thead>
          <tbody>
            {lockers.map((l) => {
              const occ = l.slots.length;
              const total = l._count.slots;
              const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
              return (
                <tr
                  key={l.id}
                  className="border-b border-[#2A2A30]/40 last:border-b-0 hover:bg-[#1C1C20]/40"
                >
                  <td className="px-4 py-3 text-secondary">
                    {l.facility.name}
                  </td>
                  <td className="px-4 py-3 text-primary font-medium">
                    #{l.lockerNumber}
                  </td>
                  <td className="px-4 py-3 text-secondary">Zone {l.zone}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-[#1C1C20] overflow-hidden">
                        <div
                          className="h-full bg-gold"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted tabular-nums">
                        {occ}/{total}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-64">
                    <ReassignForm
                      lockerId={l.id}
                      currentMemberId={l.memberId}
                      facilityMembers={
                        membersByFacility.get(l.facilityId) ?? []
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {lockers.map((l) => {
          const occ = l.slots.length;
          const total = l._count.slots;
          const pct = total > 0 ? Math.round((occ / total) * 100) : 0;
          return (
            <div key={l.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-serif text-lg text-primary">
                    Locker #{l.lockerNumber}
                  </p>
                  <p className="text-xs text-muted">
                    {l.facility.name} · Zone {l.zone}
                  </p>
                </div>
                <span className="text-xs text-muted tabular-nums">
                  {occ}/{total}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[#1C1C20] overflow-hidden mb-3">
                <div
                  className="h-full bg-gold"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted mb-1">
                  Assigned to
                </p>
                <ReassignForm
                  lockerId={l.id}
                  currentMemberId={l.memberId}
                  facilityMembers={membersByFacility.get(l.facilityId) ?? []}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
