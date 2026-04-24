"use client";

import { memo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const tooltipStyle = {
  backgroundColor: "#141416",
  border: "1px solid #2A2A30",
  borderRadius: "12px",
  color: "#E8E6E1",
  fontSize: 12,
};

interface Props {
  occupied: number;
  total: number;
}

export default memo(function OccupancyDonut({ occupied, total }: Props) {
  const safeTotal = Math.max(0, total);
  const safeOccupied = Math.max(0, Math.min(occupied, safeTotal));
  const empty = Math.max(0, safeTotal - safeOccupied);
  const percent = safeTotal > 0 ? Math.round((safeOccupied / safeTotal) * 100) : 0;

  if (safeTotal === 0) {
    return (
      <div className="glass-card p-5">
        <h2 className="font-serif text-lg text-primary">Slot occupancy</h2>
        <p className="text-xs text-muted mt-1">No lockers provisioned yet.</p>
        <div className="h-48 flex items-center justify-center">
          <p className="text-sm text-muted">0 slots</p>
        </div>
      </div>
    );
  }

  const data = [
    { name: "Occupied", value: safeOccupied },
    { name: "Empty", value: empty },
  ];
  const colors = ["#FFD166", "#2A2A30"];

  return (
    <div className="glass-card p-5">
      <h2 className="font-serif text-lg text-primary">Slot occupancy</h2>
      <p className="text-xs text-muted mt-1">
        {safeOccupied.toLocaleString()} of {safeTotal.toLocaleString()} slots
        filled.
      </p>

      <div
        className="h-64 mt-4 flex flex-col items-center justify-center"
        role="img"
        aria-label={`Slot occupancy: ${percent}% used`}
      >
        <div className="relative w-full h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={78}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString()} slots`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-semibold text-primary">
              {percent}%
            </span>
            <span className="text-xs text-muted">used</span>
          </div>
        </div>

        <div className="flex gap-4 text-xs mt-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFD166]" />
            <span className="text-secondary">
              {safeOccupied.toLocaleString()} occupied
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2A2A30]" />
            <span className="text-secondary">
              {empty.toLocaleString()} empty
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

