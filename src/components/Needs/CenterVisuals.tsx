import React, { useEffect, useMemo, useState } from "react";
import { genWeek } from "../Campaign/CoverageHeatmap";

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const addDays = (date: Date, delta: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
};
const formatISO = (date: Date) => date.toISOString().slice(0, 10);

export const RANGE_LABELS = ["Month", "Quarter", "Six Months", "Year"];
export const RANGE_WEEKS = [4, 13, 26, 52];
const START_HOUR = 8;
const ROW_COUNT = 32;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function buildLineSeries(job: string, weeks: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const series: { date: string; demand: number; supply: number }[] = [];

  let dayOffset = 0;

  for (let week = 0; week < weeks; week++) {
    const weekMatrix = genWeek(job, week, false);

    for (let day = 0; day < 7; day++) {
      if (dayOffset >= weeks * 7) break;

      const slots = weekMatrix[day];
      const demandTotal = slots.reduce((sum, slot) => slot.closed ? sum : sum + slot.demand, 0);
      const supplyTotal = slots.reduce((sum, slot) => slot.closed ? sum : sum + slot.supply, 0);

      const date = addDays(start, dayOffset);
      series.push({
        date: formatISO(date),
        demand: demandTotal / slots.length,
        supply: supplyTotal / slots.length
      });

      dayOffset++;
    }
  }

  return series;
}

function buildHeatGrid(job: string, weekOffset: number, startHour = START_HOUR, rows = ROW_COUNT) {
  const weekMatrix = genWeek(job, weekOffset, false);
  const startSlot = startHour * 2;
  const grid: number[][] = [];

  for (let r = 0; r < rows; r++) {
    const slotIdx = startSlot + r;
    const row: number[] = [];
    for (let day = 0; day < 7; day++) {
      const cell = weekMatrix[day][slotIdx];
      if (!cell || cell.closed || cell.demand <= 0) {
        row.push(0);
      } else {
        const ratio = (cell.supply - cell.demand) / Math.max(1, cell.demand);
        row.push(clamp(ratio, -1, 1));
      }
    }
    grid.push(row);
  }

  return grid;
}

function cellColor(v: number) {
  if (v < -0.1) return "#ef4444";
  if (v < 0.1) return "#f59e0b";
  return "#22c55e";
}

function IconLines({ active }: { active?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? "#111" : "#475569"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18M3 21h18" />
      <polyline points="5,14 9,9 13,11 17,6 21,8" />
      <circle cx="5" cy="14" r="1.2" /><circle cx="9" cy="9" r="1.2" /><circle cx="13" cy="11" r="1.2" /><circle cx="17" cy="6" r="1.2" /><circle cx="21" cy="8" r="1.2" />
    </svg>
  );
}

function IconHeatmap({ active }: { active?: boolean }) {
  const stroke = active ? "#111" : "#475569";
  const fill = active ? "#111" : "#64748b";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="6" y="6" width="4" height="4" fill={fill} stroke="none" />
      <rect x="12" y="6" width="4" height="4" fill={fill} stroke="none" opacity=".6" />
      <rect x="6" y="12" width="4" height="4" fill={fill} stroke="none" opacity=".6" />
      <rect x="12" y="12" width="4" height="4" fill={fill} stroke="none" />
    </svg>
  );
}

export default function CenterVisuals({ job, rangeIdx, onRangeChange }: { job: string; rangeIdx: number; onRangeChange: (idx: number) => void }) {
  const role = job || "Server";
  const [view, setView] = useState<"lines" | "heatmap">("lines");
  const weeks = RANGE_WEEKS[rangeIdx];
  const days = weeks * 7;

  const lineSeries = useMemo(() => buildLineSeries(role, weeks), [role, weeks]);

  const heatWeeks = weeks;
  const [weekIndex, setWeekIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const safeWeekIndex = heatWeeks > 0 ? Math.min(weekIndex, heatWeeks - 1) : 0;
  const heatGrid = useMemo(() => buildHeatGrid(role, safeWeekIndex), [role, safeWeekIndex]);

  useEffect(() => {
    setWeekIndex(0);
    setPlaying(false);
  }, [role, weeks]);

  useEffect(() => {
    if (!playing || heatWeeks <= 1) return;
    const id = setInterval(() => setWeekIndex((i) => (i + 1) % heatWeeks), 850);
    return () => clearInterval(id);
  }, [playing, heatWeeks]);

  return (
    <div className="w-full bg-white border rounded-xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {view === "heatmap" ? `Weekly Coverage • ${role}` : `Demand & Supply • ${role}`}
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600" htmlFor={`range-select-${role}`}>Range</label>
          <select
            id={`range-select-${role}`}
            value={rangeIdx}
            onChange={(e) => onRangeChange(Number(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1 text-gray-700 focus:outline-none focus:border-blue-500"
          >
            {RANGE_LABELS.map((label, idx) => (
              <option key={label} value={idx}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("lines")}
            className={`px-2 py-1 border rounded flex items-center gap-1 ${view === "lines" ? "bg-gray-100 border-gray-400" : "border-gray-200"}`}
            aria-label="Lines view"
          >
            <IconLines active={view === "lines"} />
          </button>
          <button
            onClick={() => setView("heatmap")}
            className={`px-2 py-1 border rounded flex items-center gap-1 ${view === "heatmap" ? "bg-gray-100 border-gray-400" : "border-gray-200"}`}
            aria-label="Heatmap view"
          >
            <IconHeatmap active={view === "heatmap"} />
          </button>
        </div>
      </div>

      {view === "lines" ? (
        <LinesChart series={lineSeries} height={360} role={role} />
      ) : (
        <div>
          <WeekHeatmap grid={heatGrid} startHour={START_HOUR} rows={ROW_COUNT} rowHeight={11} role={role} />
          <div className="mt-3 flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 border rounded"
              onClick={() => setPlaying((p) => !p)}
              disabled={heatWeeks <= 1}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, heatWeeks - 1)}
              value={safeWeekIndex}
              onChange={(e) => setWeekIndex(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-xs text-gray-600 w-20 text-right">
              Week {heatWeeks > 0 ? safeWeekIndex + 1 : 0}/{heatWeeks}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LinesChart({
  series,
  height = 360,
  role
}: {
  series: { date: string; demand: number; supply: number }[];
  height?: number;
  role: string;
}) {
  if (series.length === 0) {
    return <div className="h-[360px] flex items-center justify-center text-sm text-gray-500">No data available.</div>;
  }

  const W = 800;
  const H = height;
  const PADL = 56, PADR = 16, PADT = 18, PADB = 42;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const maxY = Math.max(1, ...series.map((s) => Math.max(s.demand, s.supply)));

  const X = (i: number) => PADL + (i / Math.max(1, series.length - 1)) * innerW;
  const Y = (v: number) => PADT + innerH - (v / maxY) * innerH;

  const baseTicks = 8;
  const yTicksFull = range(baseTicks + 1).map((t) => Math.round((t / baseTicks) * maxY));
  const yStep = Math.max(1, Math.ceil(yTicksFull.length / 10));
  const yTicks = yTicksFull.filter((_, idx) => idx % yStep === 0);

  const maxXTicks = 10;
  const stepDaysBase = 7;
  let stepDays = stepDaysBase;
  while (series.length / stepDays > maxXTicks) {
    stepDays += stepDaysBase;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[360px]">
      <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="#94a3b8" />
      <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="#94a3b8" />

      {yTicks.map((v, i) => {
        const y = Y(v);
        return (
          <g key={i}>
            <line x1={PADL - 4} x2={W - PADR} y1={y} y2={y} stroke="#e5e7eb" />
            <text x={PADL - 10} y={y + 4} fontSize="12" textAnchor="end" fill="#334155">
              {v}
            </text>
          </g>
        );
      })}
      <text x={14} y={PADT + innerH / 2} fontSize="12" fill="#334155" transform={`rotate(-90 14 ${PADT + innerH / 2})`}>
        Avg. employees per slot
      </text>

      <polyline
        fill="none"
        stroke="#b91c1c"
        strokeWidth={2.25}
        points={series.map((s, i) => `${X(i)},${Y(s.demand)}`).join(" ")}
      />
      <polyline
        fill="none"
        stroke="#1d4ed8"
        strokeWidth={2.25}
        points={series.map((s, i) => `${X(i)},${Y(s.supply)}`).join(" ")}
      />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={X(i)} cy={Y(s.demand)} r={1.8} fill="#b91c1c" />
          <circle cx={X(i)} cy={Y(s.supply)} r={1.8} fill="#1d4ed8" />
        </g>
      ))}

      {series.map((s, i) => i % stepDays === 0 && (
        <g key={`x${i}`}>
          <line x1={X(i)} x2={X(i)} y1={H - PADB} y2={H - PADB + 4} stroke="#94a3b8" />
          <text x={X(i)} y={H - PADB + 16} fontSize="12" textAnchor="middle" fill="#334155">
            {s.date.slice(5)}
          </text>
        </g>
      ))}

      <g transform={`translate(${W - 200}, ${PADT + 8})`}>
        <rect width="12" height="12" fill="#b91c1c" rx="3" />
        <text x="16" y="10" fontSize="12" fill="#1f2937">Demand</text>
        <rect x="92" width="12" height="12" fill="#1d4ed8" rx="3" />
        <text x="108" y="10" fontSize="12" fill="#1f2937">Supply</text>
      </g>

      <text x={PADL} y={PADT - 4} fontSize="12" fill="#334155">{role}</text>
    </svg>
  );
}

function WeekHeatmap({
  grid,
  startHour = START_HOUR,
  rows = ROW_COUNT,
  rowHeight = 11,
  role
}: {
  grid: number[][];
  startHour?: number;
  rows?: number;
  rowHeight?: number;
  role: string;
}) {
  const labelForRow = (r: number) => {
    if (r % 2 === 1) return "";
    const hour = startHour + Math.floor(r / 2);
    return `${String(hour).padStart(2, "0")}:00`;
  };

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "50px repeat(7, 1fr)" }}>
        <div className="h-6 text-[11px] text-gray-600 flex items-center justify-end pr-1">Time</div>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="h-6 text-xs text-gray-600 flex items-center justify-center border-l">
            {d}
          </div>
        ))}
      </div>
      <div className="border-t">
        {range(rows).map((r) => (
          <div key={r} className="grid" style={{ gridTemplateColumns: "50px repeat(7, 1fr)" }}>
            <div className="flex items-center justify-end pr-1 text-[11px] text-gray-600" style={{ height: rowHeight }}>
              {labelForRow(r)}
            </div>
            {range(7).map((c) => (
              <div
                key={`${r}-${c}`}
                className="border-l border-t"
                style={{
                  height: rowHeight,
                  background: cellColor(grid[r][c])
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

