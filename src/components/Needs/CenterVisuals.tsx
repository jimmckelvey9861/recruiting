import React, { useEffect, useMemo, useState } from "react";
import { genWeek } from "../Campaign/CoverageHeatmap";
import { useOverrideVersion } from '../../state/dataOverrides'
import { useCampaignPlanVersion, getStateSnapshot, getHiresPerDay, setLiveView, isScheduledOn } from '../../state/campaignPlan'

const addDays = (date: Date, delta: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
};
const formatISO = (date: Date) => date.toISOString().slice(0, 10);

export const RANGE_LABELS = ["Month", "Quarter", "Six Months", "Year"];
// Calendar-aligned period computation: start = today 00:00 local; end = +N months; weeks = ceil(days/7)
const MONTHS_BY_RANGE = [1, 3, 6, 12];
export function getRangeDayCount(rangeIdx: number): number {
  const months = MONTHS_BY_RANGE[Math.max(0, Math.min(MONTHS_BY_RANGE.length - 1, rangeIdx))] || 1;
  const start = new Date();
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  // days strictly between start (inclusive) and end (exclusive)
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
export function getRangeWeeks(rangeIdx: number): number {
  return Math.ceil(getRangeDayCount(rangeIdx) / 7);
}
const DISPLAY_START_HOUR = 7;
const DISPLAY_END_HOUR = 23;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function buildLineSeries(job: string, weeks: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const series: { date: string; demand: number; supply: number; newHire: number }[] = [];

  let dayOffset = 0;
  // Campaign dynamics for separate line
  const state = getStateSnapshot();
  const onboardingDelayDays = 3; // simple onboarding lag
  const dailyQuitRate = 0.10 / 30; // ~10% monthly attrition (~3.3% per month)
  let accumulatedEmployees = 0; // Total accumulated employees from campaign

  for (let week = 0; week < weeks; week++) {
    // Always compute base week without merged overlay; we'll add new hires ourselves below if liveView is ON.
    const weekMatrix = genWeek(job, week, false);

    for (let day = 0; day < 7; day++) {
      if (dayOffset >= weeks * 7) break;

      const daySlots = weekMatrix[day] || [];
      const slots = daySlots.filter(slot => !slot.closed && slot.demand > 0);
      const demandTotal = slots.reduce((sum, slot) => sum + slot.demand, 0);
      const supplyTotal = slots.reduce((sum, slot) => sum + slot.supply, 0);

      const date = addDays(start, dayOffset);
      // compute for parity with previous logic (not used after lagged scheduling)
      // const sinceStartDays = ...
      
      let newHireTotal = 0;
      // Compute campaign-driven hires accumulation regardless of liveView
      const hasSpend = Math.max(0, Number(state.planner.dailySpend || 0)) > 0;
      
      // Apply attrition daily
      accumulatedEmployees *= (1 - dailyQuitRate);
      
      // Add new hires based on lagged schedule:
      // hires today reflect spend that occurred onboardingDelayDays ago
      const lagDate = addDays(date, -onboardingDelayDays);
      const scheduled = hasSpend && isScheduledOn(lagDate);
      if (scheduled) {
        const hiresPerDay = getHiresPerDay();
        accumulatedEmployees += hiresPerDay;
      }
      
      // Convert accumulated employees to hours/day
      const halfHoursPerEmployee = (30 / 7) * 2;
      const totalHalfHours = accumulatedEmployees * halfHoursPerEmployee;
      newHireTotal = totalHalfHours;
      
      series.push({
        date: formatISO(date),
        demand: Math.round(demandTotal * 0.5),     // hours/day
        supply: Math.round((supplyTotal * 0.5) + (state.liveView ? ((newHireTotal || 0) / 2) : 0)), // merge if liveView
        newHire: Math.round((newHireTotal || 0) / 2) // hours/day
      });

      dayOffset++;
    }
  }

  return series;
}

type HeatCell = { demand: number; supply: number; delta: number; coveragePct: number } | null;

function buildHeatGrid(job: string, weekOffset: number, withCampaign: boolean) {
  // Always start from baseline; we'll add overlay ourselves for Plan heatmap
  const weekMatrix = genWeek(job, weekOffset, false);
  const startSlot = DISPLAY_START_HOUR * 2;
  const endSlot = DISPLAY_END_HOUR * 2;
  const grid: HeatCell[][] = [];
  // Monday of this offset week (align with genWeek)
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + weekOffset * 7);
  mon.setHours(0,0,0,0);
  // Accumulation parameters (mirror Lines logic)
  const onboardingDelayDays = 3;
  const dailyQuitRate = 0.10 / 30; // ~10%/month
  const hiresPerDay = getHiresPerDay();
  const planner = getStateSnapshot().planner;
  const plannerStart = planner.startDate ? new Date(planner.startDate) : null;
  const hasSpend = Math.max(0, Number(planner.dailySpend || 0)) > 0;
  if (plannerStart) plannerStart.setHours(0,0,0,0);

  for (let slotIdx = startSlot; slotIdx < endSlot; slotIdx++) {
    const row: HeatCell[] = [];
    for (let day = 0; day < 7; day++) {
      const daySlots = weekMatrix[day] || [];
      const cell = daySlots[slotIdx];
      if (!cell || cell.closed || cell.demand <= 0) {
        row.push(null);
      } else {
        let supply = cell.supply || 0;
        const demand = cell.demand || 0;
        if (withCampaign) {
          const dateForDay = new Date(mon); dateForDay.setDate(mon.getDate() + day);
          // Compute accumulated employees as of this day (onboarding + attrition)
          let accumulated = 0;
          if (plannerStart && dateForDay.getTime() >= plannerStart.getTime()) {
            const daysSinceStart = Math.floor((dateForDay.getTime() - plannerStart.getTime()) / (1000*60*60*24));
            for (let i = 0; i <= daysSinceStart; i++) {
              // daily attrition
              accumulated *= (1 - dailyQuitRate);
              // add hires when campaign schedule (lagged by onboarding)
              const current = new Date(plannerStart); current.setDate(plannerStart.getDate() + i - onboardingDelayDays);
              if (i >= onboardingDelayDays && hasSpend && isScheduledOn(current)) {
                accumulated += hiresPerDay;
              }
            }
          }
          const extraHalfHoursPerDay = accumulated * (30/7) * 2;
          // Distribute across open slots for this day
          const openSlots = Array.from({ length: 48 }, (_, idx) => idx).filter(idx => {
            const c = weekMatrix[day]?.[idx];
            return c && !c.closed && (c.demand || 0) > 0;
          });
          const perSlot = openSlots.length > 0 ? (extraHalfHoursPerDay / openSlots.length) : 0;
          if (perSlot > 0 && openSlots.includes(slotIdx)) {
            supply += Math.round(perSlot);
          }
        }
        const delta = Math.round(supply - demand);
        const coveragePct = (supply / Math.max(1, demand)) * 100;
        row.push({ demand, supply, delta, coveragePct });
      }
    }
    grid.push(row);
  }

  return grid;
}

// Diverging palette (Option A: RdBu) mapped to 5 bands using zone thresholds
const PALETTE = {
  undersupplySevere: "#7F0000",
  undersupplyMild:   "#EF8A62",
  neutral:           "#F7F7F7",
  oversupplyMild:    "#67A9CF",
  oversupplySevere:  "#053061",
};
function colorFromZones(coveragePct: number, z: Zones) {
  if (coveragePct <= z.lowRed) return PALETTE.undersupplySevere;
  if (coveragePct < z.lowYellow) return PALETTE.undersupplyMild;
  if (coveragePct <= z.highYellow) return PALETTE.neutral;
  if (coveragePct <= z.highRed) return PALETTE.oversupplyMild;
  return PALETTE.oversupplySevere;
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

type Zones = { lowRed: number; lowYellow: number; highYellow: number; highRed: number };

export default function CenterVisuals({ job, rangeIdx, onRangeChange, zones }: { job: string; rangeIdx: number; onRangeChange: (idx: number) => void; zones: Zones }) {
  const role = job || "Server";
  const [view, setView] = useState<"lines" | "heatmap">("lines");
  const weeks = getRangeWeeks(rangeIdx);
  const periodDays = getRangeDayCount(rangeIdx);
  const overrideVersion = useOverrideVersion();
  const planVersion = useCampaignPlanVersion();

  const lineSeries = useMemo(() => buildLineSeries(role, weeks), [role, weeks, overrideVersion, planVersion]);
  // Y-axis scaling: 33% above max; recompute only when range or role changes
  const [yMax, setYMax] = useState<number>(150);
  useEffect(() => {
    const maxVal = lineSeries.reduce((m, p) => Math.max(m, p.demand, p.supply, p.newHire), 0);
    const target = Math.max(10, Math.ceil((maxVal * 1.33) / 10) * 10);
    setYMax(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx, role]);

  const heatWeeks = weeks;
  const [weekIndex, setWeekIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const safeWeekIndex = heatWeeks > 0 ? Math.min(weekIndex, heatWeeks - 1) : 0;
  const state = useMemo(() => getStateSnapshot(), [planVersion]);
  const withCampaign = !!state.liveView;
  const heatGrid = useMemo(() => buildHeatGrid(role, safeWeekIndex, withCampaign), [role, safeWeekIndex, withCampaign, overrideVersion, planVersion]);
  const headerMeta = useMemo(() => {
    // Compute baseline then apply accumulated overlay (same as cell logic)
    const wm = genWeek(role, safeWeekIndex, false);
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + safeWeekIndex * 7);
    mon.setHours(0,0,0,0);
    const onboardingDelayDays = 3;
    const dailyQuitRate = 0.10 / 30;
    const hiresPerDay = getHiresPerDay();
    const planner = getStateSnapshot().planner;
    const plannerStart = planner.startDate ? new Date(planner.startDate) : null;
    const hasSpend = Math.max(0, Number(planner.dailySpend || 0)) > 0;
    if (plannerStart) plannerStart.setHours(0,0,0,0);
    const arr = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(mon); date.setDate(mon.getDate() + d);
      // accumulate employees as of this day
      let accumulated = 0;
      if (plannerStart && date.getTime() >= plannerStart.getTime()) {
        const daysSinceStart = Math.floor((date.getTime() - plannerStart.getTime()) / (1000*60*60*24));
        for (let i = 0; i <= daysSinceStart; i++) {
          accumulated *= (1 - dailyQuitRate);
          const current = new Date(plannerStart); current.setDate(plannerStart.getDate() + i - onboardingDelayDays);
          if (i >= onboardingDelayDays && hasSpend && isScheduledOn(current)) {
            accumulated += hiresPerDay;
          }
        }
      }
      const extraHalfHoursPerDay = accumulated * (30/7) * 2;
      const daySlots = wm[d] || [];
      let demandH = 0, supplyH = 0;
      let openCount = 0;
      for (let s = DISPLAY_START_HOUR * 2; s < DISPLAY_END_HOUR * 2; s++) {
        const cell = daySlots[s];
        if (cell && !cell.closed && (cell.demand || 0) > 0) openCount++;
      }
      const perSlot = openCount > 0 ? (extraHalfHoursPerDay / openCount) : 0;
      for (let s = DISPLAY_START_HOUR * 2; s < DISPLAY_END_HOUR * 2; s++) {
        const cell = daySlots[s];
        if (!cell || cell.closed) continue;
        const supply = (cell.supply || 0) + (perSlot > 0 ? Math.round(perSlot) : 0);
        demandH += (cell.demand || 0) * 0.5;
        supplyH += supply * 0.5;
      }
      arr.push({ date, demandH: Math.round(demandH), supplyH: Math.round(supplyH) });
    }
    return arr;
  }, [role, safeWeekIndex, withCampaign, overrideVersion, planVersion]);

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
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={!!getStateSnapshot().liveView}
              onChange={(e)=> setLiveView(e.target.checked)}
            />
            <span>Merge new hires</span>
          </label>
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
        <LinesChart series={lineSeries} height={433} yMax={yMax} />
      ) : (
        <div>
          {/* Move the daily coverage summary control directly under the header */}
          <div className="mb-3">
            <DailyCoverageSummary
              job={role}
              weeks={weeks}
              zones={zones}
              withCampaign={withCampaign}
              weekIndex={safeWeekIndex}
              periodDays={periodDays}
              onWeekChange={(w)=> setWeekIndex(Math.max(0, Math.min(heatWeeks-1, w)))}
            />
          </div>
          <WeekHeatmap grid={heatGrid} rowHeight={11} headerMeta={headerMeta} zones={zones} />
        </div>
      )}
    </div>
  );
}

function LinesChart({
  series,
  height = 360,
  yMax = 150,
}: {
  series: { date: string; demand: number; supply: number; newHire: number }[];
  height?: number;
  yMax?: number;
}) {
  if (series.length === 0) {
    return <div className="h-[360px] flex items-center justify-center text-sm text-gray-500">No data available.</div>;
  }

  const W = 860;
  const H = height;
  const PADL = 58, PADR = 16, PADT = 26, PADB = 58;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const state = getStateSnapshot();
  const showSeparate = !state.liveView;
  const maxY = Math.max(1, yMax);
  const supplyLegendLabel = state.liveView ? "Supply + New Hires" : "Supply";

  const X = (i: number) => PADL + (i / Math.max(1, series.length - 1)) * innerW;
  const Y = (v: number) => PADT + innerH - (v / maxY) * innerH;
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const onMove = (evt: React.MouseEvent<SVGSVGElement>) => {
    const svg = (evt.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const t = Math.max(0, Math.min(1, (x - PADL) / innerW));
    const idx = Math.round(t * (Math.max(1, series.length - 1)));
    const hx = X(idx);
    const hy = Y(Math.max(series[idx]?.demand || 0, series[idx]?.supply || 0));
    setHover({ i: idx, x: hx, y: hy });
  };
  const onLeave = () => setHover(null);

  const yTicks: number[] = [];
  const step = Math.max(10, Math.ceil(maxY / 10));
  for (let v = 0; v <= maxY; v += step) yTicks.push(v);

  const maxXTicks = 10;
  const stepDaysBase = 7;
  let stepDays = stepDaysBase;
  while (series.length / stepDays > maxXTicks) {
    stepDays += stepDaysBase;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={onLeave}>
      <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="#94a3b8" />
      <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="#94a3b8" />

      {yTicks.map((v, i) => {
        const y = Y(v);
        return (
          <g key={i}>
            <line x1={PADL - 4} x2={W - PADR} y1={y} y2={y} stroke="#e5e7eb" />
            <text x={PADL - 10} y={y + 4} fontSize="14" fontWeight={600} textAnchor="end" fill="#1f2937">
              {v}
            </text>
          </g>
        );
      })}
      <text x={14} y={PADT + innerH / 2} fontSize="14" fontWeight={600} fill="#1f2937" transform={`rotate(-90 14 ${PADT + innerH / 2})`}>
        Labor-hours per day
      </text>

      <polyline
        fill="none"
        stroke="#b91c1c"
        strokeWidth={3.5}
        points={series.map((s, i) => `${X(i)},${Y(s.demand)}`).join(" ")}
      />
      <polyline
        fill="none"
        stroke="#1d4ed8"
        strokeWidth={3.5}
        points={series.map((s, i) => `${X(i)},${Y(s.supply)}`).join(" ")}
      />
      {showSeparate && (
        <polyline
          fill="none"
          stroke="#16a34a"
          strokeWidth={3.5}
          points={series.map((s, i) => `${X(i)},${Y(s.newHire)}`).join(" ")}
        />
      )}
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={X(i)} cy={Y(s.demand)} r={2.4} fill="#b91c1c" />
          <circle cx={X(i)} cy={Y(s.supply)} r={2.4} fill="#1d4ed8" />
          {showSeparate && <circle cx={X(i)} cy={Y(s.newHire)} r={2.4} fill="#16a34a" />}
        </g>
      ))}

      {/* Week separators on each Monday (every 7 days) */}
      {series.map((_p, i) => (i % 7 === 0) && (
        <line key={`wk-${i}`} x1={X(i)} x2={X(i)} y1={PADT} y2={H - PADB} stroke="#e2e8f0" />
      ))}

      {series.map((s, i) => i % stepDays === 0 && (
        <g key={`x${i}`}>
          <line x1={X(i)} x2={X(i)} y1={H - PADB} y2={H - PADB + 4} stroke="#94a3b8" />
          <text x={X(i)} y={H - PADB + 16} fontSize="14" fontWeight={600} textAnchor="middle" fill="#1f2937">
            {s.date.slice(5)}
          </text>
        </g>
      ))}

      <g transform={`translate(${W - 260}, ${PADT + 8})`}>
        <rect width="12" height="12" fill="#b91c1c" rx="3" />
        <text x="16" y="10" fontSize="12" fill="#1f2937">Demand</text>
        <rect x="92" width="12" height="12" fill="#1d4ed8" rx="3" />
        <text x="108" y="10" fontSize="12" fill="#1f2937">{supplyLegendLabel}</text>
        {showSeparate && (
          <>
            <rect x="170" width="12" height="12" fill="#16a34a" rx="3" />
            <text x="186" y="10" fontSize="12" fill="#1f2937">New Hires</text>
          </>
        )}
      </g>

      {/* Hover tooltip */}
      {hover && series[hover.i] && (
        <g pointerEvents="none">
          <line x1={hover.x} y1={PADT} x2={hover.x} y2={H - PADB} stroke="#94a3b8" strokeDasharray="4 3" />
          <circle cx={hover.x} cy={Y(series[hover.i].demand)} r={3} fill="#b91c1c" />
          <circle cx={hover.x} cy={Y(series[hover.i].supply)} r={3} fill="#1d4ed8" />
          <rect x={Math.min(hover.x + 8, W - PADR - 150)} y={Math.max(PADT + 6, hover.y - 46)} width="150" height="54" rx="6" fill="#ffffff" stroke="#cbd5e1" />
          <text x={Math.min(hover.x + 16, W - PADR - 142)} y={Math.max(PADT + 20, hover.y - 30)} fontSize="11" fontWeight={600} fill="#0f172a">
            {series[hover.i].date}
          </text>
          <text x={Math.min(hover.x + 16, W - PADR - 142)} y={Math.max(PADT + 36, hover.y - 14)} fontSize="11" fill="#b91c1c">
            Demand: {series[hover.i].demand} h
          </text>
          <text x={Math.min(hover.x + 16, W - PADR - 142)} y={Math.max(PADT + 50, hover.y)} fontSize="11" fill="#1d4ed8">
            Supply: {series[hover.i].supply} h
          </text>
        </g>
      )}

    </svg>
  );
}

// ---- Daily Coverage Summary Control (bars + week selector) ----
function DailyCoverageSummary({
  job,
  weeks,
  zones,
  withCampaign,
  weekIndex,
  periodDays,
  onWeekChange
}: {
  job: string;
  weeks: number;
  zones: Zones;
  withCampaign: boolean;
  weekIndex: number;
  periodDays: number;
  onWeekChange: (w: number) => void;
}) {
  // Recompute summaries when campaign plan changes (e.g., daily spend slider moves)
  const planVersion = useCampaignPlanVersion();
  // Build day summaries across the selected period
  const days = useMemo(() => {
    const items: { date: string; lightUnderCount: number; heavyUnderCount: number; lightOverCount: number; heavyOverCount: number }[] = [];
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday=0
    const startMonday = new Date(now);
    startMonday.setDate(now.getDate() - dayOfWeek);
    startMonday.setHours(0,0,0,0);

    for (let w = 0; w < weeks; w++) {
      const grid = buildHeatGrid(job, w, withCampaign);
      // For each day (0..6) aggregate slot categories
      for (let d = 0; d < 7; d++) {
        if (items.length >= Math.max(1, periodDays)) break;
        let lightUnder = 0, heavyUnder = 0, lightOver = 0, heavyOver = 0;
        for (let r = 0; r < grid.length; r++) {
          const cell = grid[r][d];
          if (!cell) continue;
          const cov = cell.coveragePct;
          if (cov <= zones.lowRed) heavyUnder++;
          else if (cov < zones.lowYellow) lightUnder++;
          else if (cov <= zones.highYellow) {
            // balanced; ignore
          } else if (cov <= zones.highRed) lightOver++;
          else heavyOver++;
        }
        const date = new Date(startMonday);
        date.setDate(startMonday.getDate() + w * 7 + d);
        items.push({
          date: date.toISOString().slice(0,10),
          lightUnderCount: lightUnder,
          heavyUnderCount: heavyUnder,
          lightOverCount: lightOver,
          heavyOverCount: heavyOver
        });
      }
    }
    // Cap to exact calendar-aligned day count
    return items.slice(0, Math.max(1, periodDays));
  }, [job, weeks, zones, withCampaign, planVersion, periodDays]);

  const dayCount = days.length;
  // Measure container width so the control spans exactly the heatmap's Monday..Sunday columns.
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [svgWidth, setSvgWidth] = useState<number>(730);
  useEffect(() => {
    const measure = () => {
      const el = hostRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // Subtract the fixed 50px time column used by the heatmap grid
      const next = Math.max(320, Math.floor(rect.width - 50));
      setSvgWidth(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hostRef.current) ro.observe(hostRef.current);
    window.addEventListener('resize', measure);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', measure);
    };
  }, []);
  const svgHeight = 220;
  const weekCount = Math.max(1, Math.ceil(dayCount/7));

  const extremes = useMemo(() => {
    let maxOver = 0, maxUnder = 0;
    for (const d of days) {
      maxOver = Math.max(maxOver, d.lightOverCount + d.heavyOverCount);
      maxUnder = Math.max(maxUnder, d.lightUnderCount + d.heavyUnderCount);
    }
    return { maxOver: Math.max(1, maxOver), maxUnder: Math.max(1, maxUnder) };
  }, [days]);

  const verticalPadding = 8;
  const axisBandHeight = 12;
  const halfAvailable = (svgHeight - axisBandHeight - 2*verticalPadding)/2 - 2;
  const zeroBandTopY = verticalPadding + halfAvailable;
  const zeroBandBottomY = zeroBandTopY + axisBandHeight;
  const unitHeightOver = halfAvailable / extremes.maxOver;
  const unitHeightUnder = halfAvailable / extremes.maxUnder;

  const slotWidth = svgWidth / Math.max(1, dayCount);
  // Add a 1px gap between columns by shrinking each bar by 1px
  const barWidth = Math.max(0, slotWidth - 1);
  const sliderRadius = 10;

  // Slider X position: keep smooth while dragging; snap to week center on external changes
  const [sliderX, setSliderX] = useState<number>(() => {
    const fraction = (Math.max(0, Math.min(weekCount - 1, weekIndex)) + 0.5) / Math.max(1, weekCount);
    const x0 = fraction * svgWidth;
    return Math.min(Math.max(sliderRadius, x0), Math.max(sliderRadius, svgWidth - sliderRadius));
  });
  useEffect(() => {
    // When not dragging, center the handle on the selected week
    if (!drag) {
      const fraction = (Math.max(0, Math.min(weekCount - 1, weekIndex)) + 0.5) / Math.max(1, weekCount);
      const x0 = fraction * svgWidth;
      setSliderX(Math.min(Math.max(sliderRadius, x0), Math.max(sliderRadius, svgWidth - sliderRadius)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekIndex, weekCount, svgWidth]);

  const svgRef = React.useRef<SVGSVGElement|null>(null);
  const [drag, setDrag] = useState(false);
  // Throttle outward updates while dragging to improve performance
  const rafId = React.useRef<number | null>(null);
  const pendingWeek = React.useRef<number | null>(null);
  const scheduleFlush = () => {
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      if (pendingWeek.current != null) {
        onWeekChange(pendingWeek.current);
        pendingWeek.current = null;
      }
    });
  };
  const updateFromPixelX = (px: number) => {
    const clamped = Math.min(Math.max(sliderRadius, px), Math.max(sliderRadius, svgWidth - sliderRadius));
    setSliderX(clamped); // follow pointer smoothly
    const fraction = svgWidth > 0 ? (clamped / svgWidth) : 0;
    const approxDay = fraction * dayCount;
    const nextWeek = Math.max(0, Math.min(weekCount - 1, Math.floor(approxDay / 7)));
    if (drag) {
      pendingWeek.current = nextWeek;
      scheduleFlush();
    } else {
      onWeekChange(nextWeek);
    }
  };

  const onClickSvg = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateFromPixelX(e.clientX - rect.left);
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    updateFromPixelX(e.clientX - rect.left);
  };
  const endDrag = () => setDrag(false);

  // Colors (match diverging palette in heatmap)
  const C = {
    heavyUnder: "#7F0000",
    lightUnder: "#EF8A62",
    band: "#F7F7F7",
    lightOver: "#67A9CF",
    heavyOver: "#053061",
    slider: "#007bff",
  };

  return (
    <div ref={hostRef} className="w-full">
      {/* Offset left so chart aligns to Monday column; width equals Monday..Sunday span */}
      <div style={{ marginLeft: 50 }}>
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          className="block"
          onClick={onClickSvg}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{ cursor: 'pointer' }}
        >
          <defs>
            <filter id="knobShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.25" />
            </filter>
          </defs>
          {/* Background so the 1px inter-column gap shows white above */}
          <rect x={0} y={0} width={svgWidth} height={zeroBandTopY} fill="#ffffff" />
          <rect
            x={0}
            y={zeroBandTopY}
            width={svgWidth}
            height={axisBandHeight}
            rx={axisBandHeight/2}
            ry={axisBandHeight/2}
            fill={C.band}
            stroke="#d1d5db"
            strokeWidth={1}
          />
          {/* Minimal X-axis legend: Month → mid of each week; longer ranges → month abbreviations */}
          <g pointerEvents="none">
            {(() => {
              const labels: { x: number; text: string }[] = [];
              if (weeks === 4) {
                // Mid-day of each week (Thursday, index 3)
                for (let w = 0; w < 4; w++) {
                  const di = Math.min(dayCount - 1, w * 7 + 3);
                  const x = (di + 0.5) * slotWidth;
                  const iso = days[di]?.date || "";
                  const mm = iso.slice(5, 7);
                  const dd = iso.slice(8, 10);
                  labels.push({ x, text: `${mm}-${dd}` });
                }
              } else {
                // Quarter / Six Months / Year: show month abbreviations
                const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
                let currentMonth = -1;
                let monthStart = 0;
                for (let i = 0; i < dayCount; i++) {
                  const iso = days[i]?.date || "";
                  const m = Number(iso.slice(5,7)) - 1; // 0..11
                  if (i === 0) { currentMonth = m; monthStart = 0; }
                  if (m !== currentMonth || i === dayCount - 1) {
                    const endIdx = (m !== currentMonth) ? i - 1 : i;
                    const mid = Math.floor((monthStart + endIdx) / 2);
                    const x = (mid + 0.5) * slotWidth;
                    labels.push({ x, text: MONTHS[currentMonth >= 0 ? currentMonth : 0] });
                    currentMonth = m;
                    monthStart = i;
                  }
                }
              }
              return labels.map((l, idx) => (
                <text
                  key={`lbl-${idx}`}
                  x={l.x}
                  y={zeroBandTopY + axisBandHeight - 2}
                  fontSize="10"
                  textAnchor="middle"
                  fill="#64748b"
                >
                  {l.text}
                </text>
              ));
            })()}
          </g>
          {days.map((d, i) => {
            const x = i * slotWidth;
            const overUnits = d.lightOverCount + d.heavyOverCount;
            const underUnits = d.lightUnderCount + d.heavyUnderCount;
            const overH = overUnits * unitHeightOver;
            const overTopY = zeroBandTopY - overH;
            const underBaseY = zeroBandBottomY;

            const parts: JSX.Element[] = [];
            const heavyOverH = d.heavyOverCount * unitHeightOver;
            const lightOverH = d.lightOverCount * unitHeightOver;
            const heavyUnderH = d.heavyUnderCount * unitHeightUnder;
            const lightUnderH = d.lightUnderCount * unitHeightUnder;

            if (overUnits > 0) {
              let y = overTopY;
              if (heavyOverH > 0) {
                parts.push(<rect key={`oh-${i}`} x={x} y={y} width={barWidth} height={heavyOverH} fill={C.heavyOver} />);
                y += heavyOverH;
              }
              if (lightOverH > 0) {
                parts.push(<rect key={`ol-${i}`} x={x} y={y} width={barWidth} height={lightOverH} fill={C.lightOver} />);
              }
            }

            if (underUnits > 0) {
              let y = underBaseY;
              if (lightUnderH > 0) {
                parts.push(<rect key={`ul-${i}`} x={x} y={y} width={barWidth} height={lightUnderH} fill={C.lightUnder} />);
                y += lightUnderH;
              }
              if (heavyUnderH > 0) {
                parts.push(<rect key={`uh-${i}`} x={x} y={y} width={barWidth} height={heavyUnderH} fill={C.heavyUnder} />);
              }
            }
            return <g key={i}>{parts}</g>;
          })}

          {/* Slider handle */}
          <g
            role="slider"
            aria-label="Week"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, weekCount - 1)}
            aria-valuenow={Math.max(0, Math.min(weekCount - 1, weekIndex))}
            tabIndex={0}
            onClick={(e)=> e.stopPropagation()}
            onMouseDown={(e)=> { e.stopPropagation(); setDrag(true); }}
            onKeyDown={(e) => {
              let next = weekIndex;
              if (e.key === 'ArrowLeft') next = Math.max(0, weekIndex - 1);
              else if (e.key === 'ArrowRight') next = Math.min(weekCount - 1, weekIndex + 1);
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = Math.max(0, weekCount - 1);
              else if (e.key === 'PageUp') next = Math.max(0, weekIndex - 4);
              else if (e.key === 'PageDown') next = Math.min(weekCount - 1, weekIndex + 4);
              else return;
              e.preventDefault();
              onWeekChange(next);
            }}
          >
            <circle
              cx={sliderX}
              cy={zeroBandTopY + axisBandHeight/2}
              r={sliderRadius}
              fill={C.slider}
              stroke="#ffffff"
              strokeWidth={3}
              filter="url(#knobShadow)"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}

function WeekHeatmap({
  grid,
  rowHeight = 11,
  headerMeta,
  zones
}: {
  grid: HeatCell[][];
  rowHeight?: number;
  headerMeta: { date: Date; demandH: number; supplyH: number }[];
  zones: Zones;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; demand: number; supply: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const labelForRow = (r: number) => {
    const slotIdx = DISPLAY_START_HOUR * 2 + r;
    if (slotIdx % 2 === 1) return "";
    const hour = Math.floor(slotIdx / 2);
    return `${String(hour).padStart(2, "0")}:00`;
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="grid" style={{ gridTemplateColumns: "50px repeat(7, 1fr)" }}>
        <div className="h-10 text-[11px] text-gray-600 flex items-center justify-end pr-1">Time</div>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => {
          const meta = headerMeta[idx];
          const mm = String((meta?.date.getMonth() ?? 0) + 1).padStart(2, '0');
          const dd = String(meta?.date.getDate() ?? 1).padStart(2, '0');
          return (
            <div key={d} className="h-10 text-xs text-gray-700 flex flex-col items-center justify-center border-l">
              <div className="leading-none">{d}</div>
              <div className="mt-[3px] flex items-center gap-2 leading-none">
                <span className="text-blue-600 font-semibold">{meta?.demandH ?? 0}</span>
                <span className="text-rose-600 font-semibold">{meta?.supplyH ?? 0}</span>
                <span className="text-slate-500">{mm}-{dd}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="border-t max-h-[520px] overflow-auto">
        {range(grid.length).map((r) => (
          <div key={r} className="grid" style={{ gridTemplateColumns: "50px repeat(7, 1fr)" }}>
            <div className="flex items-center justify-end pr-1 text-[11px] text-gray-600" style={{ height: rowHeight }}>
              {labelForRow(r)}
            </div>
            {range(7).map((c) => {
              const cell = grid[r][c];
              const bg = cell ? colorFromZones(cell.coveragePct, zones) : '#e5e7eb';
              const label = cell ? (cell.delta > 0 ? `+${cell.delta}` : String(cell.delta)) : '';
              // Ensure neutral (0) is readable on light background: use black
              const txt = cell ? (cell.delta <= 0 ? '#000000' : '#ffffff') : '#ffffff';
              return (
                <div
                  key={`${r}-${c}`}
                  className="border-l border-t relative"
                  style={{
                    height: rowHeight,
                    background: bg
                  }}
                  onMouseMove={(e) => {
                    if (!cell || !containerRef.current) { setHover(null); return; }
                    const rect = containerRef.current.getBoundingClientRect();
                    setHover({ x: e.clientX - rect.left + 10, y: e.clientY - rect.top + 10, demand: cell.demand, supply: cell.supply });
                  }}
                  onMouseLeave={() => setHover(null)}
                >
                  {cell && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-semibold leading-none select-none" style={{ color: txt }}>{label}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {hover && (
        <div
          className="absolute pointer-events-none bg-white border border-slate-300 shadow-sm rounded px-2 py-1 text-[11px] text-slate-800"
          style={{ left: hover.x, top: hover.y, zIndex: 20 }}
        >
          <div>Demand: <b>{hover.demand}</b></div>
          <div>Supply: <b>{hover.supply}</b></div>
        </div>
      )}
    </div>
  );
}

