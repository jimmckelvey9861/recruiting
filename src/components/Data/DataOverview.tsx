import React, { useMemo, useRef, useState } from 'react';
import { genWeek } from '../Campaign/CoverageHeatmap';
import { isScheduledOn, getExtraSupplyHalfHoursPerDay, useCampaignPlanVersion, getStateSnapshot } from '../../state/campaignPlan';
import { useOverrideVersion } from '../../state/dataOverrides';

type DayPoint = {
  dateISO: string;
  demandPH: number;   // person-hours
  supplyPH: number;   // person-hours
  expectedPH: number; // person-hours from campaign overlay
  hourLabels: string[];
  hourDemand: number[]; // person-hours per hour
  hourSupply: number[]; // person-hours per hour
  hourExpected: number[]; // person-hours per hour
};

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mondayOf(offsetWeeks = 0) {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + offsetWeeks * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function formatISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function DataOverview({ job, weeks = 13, height = 300 }: { job: string; weeks?: number; height?: number }) {
  const overrideVersion = useOverrideVersion();
  const planVersion = useCampaignPlanVersion();
  const points: DayPoint[] = useMemo(() => {
    const out: DayPoint[] = [];
    // Cumulative expected overlay (in half-hours) with attrition
    let accumHH = 0; // running stock of expected half-hours contributed by campaign
    const dailyQuitRate = 0.10 / 30; // ~3.3% per day (10% per month)
    for (let w = 0; w < weeks; w++) {
      const week = genWeek(job, w, false);
      const mon = mondayOf(w);
      for (let d = 0; d < 7; d++) {
        const daySlots = week[d] || [];
        // Build hourly sums (2 half-hours per hour)
        const hourDemand: number[] = Array(24).fill(0);
        const hourSupply: number[] = Array(24).fill(0);
        const hourExpected: number[] = Array(24).fill(0);
        for (let slot = 0; slot < 48; slot++) {
          const cell = daySlots[slot];
          if (!cell || cell.closed) continue;
          const hr = Math.floor(slot / 2);
          hourDemand[hr] += (cell.demand || 0) * 0.5; // person-hours
          hourSupply[hr] += (cell.supply || 0) * 0.5;
        }
        const demandPH = hourDemand.reduce((a, b) => a + b, 0);
        const supplyPH = hourSupply.reduce((a, b) => a + b, 0);
        const date = addDays(mon, d);
        // Expected per day (campaign overlay) — cumulative with attrition
        const scheduled = isScheduledOn(date);
        const extraHH = scheduled ? getExtraSupplyHalfHoursPerDay() : 0;
        // apply attrition first, then add today's expected
        accumHH = accumHH * (1 - dailyQuitRate) + extraHH;
        const expectedPH = accumHH / 2;
        // For per-hour tooltip breakdown, show the daily addition distribution (not the whole stock)
        if (extraHH > 0) {
          const openSlots: number[] = [];
          for (let s = 0; s < 48; s++) {
            const c = daySlots[s];
            if (c && !c.closed) openSlots.push(s);
          }
          const perSlotHH = openSlots.length > 0 ? extraHH / openSlots.length : 0;
          for (const s of openSlots) {
            const hr = Math.floor(s / 2);
            hourExpected[hr] += perSlotHH / 2; // convert HH to H for that hour (daily addition only)
          }
        }
        const hourLabels = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);
        out.push({
          dateISO: formatISO(date),
          demandPH,
          supplyPH,
          expectedPH,
          hourLabels,
          hourDemand,
          hourSupply,
          hourExpected,
        });
      }
    }
    return out;
  }, [job, weeks, overrideVersion, planVersion]);

  const W = 1000;
  const H = height;
  const PADL = 56, PADR = 16, PADT = 18, PADB = 46;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;

  // Fixed scale 0..150 hours/day
  const maxY = 150;

  const X = (i: number) => PADL + (i / Math.max(1, points.length - 1)) * innerW;
  const Y = (v: number) => PADT + innerH - (v / maxY) * innerH;

  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // 0, 10, ..., 150
  const yTicks = Array.from({ length: 16 }, (_, i) => i * 10);
  const dayStep = Math.max(1, Math.ceil(points.length / 12)); // ~12 x-axis labels

  const hoverPoint = hoverIdx != null ? points[hoverIdx] : null;
  const hoverX = hoverIdx != null ? X(hoverIdx) : 0;
  const hoverY = hoverIdx != null ? Y(hoverPoint?.supplyPH || 0) : 0;

  return (
    <div ref={containerRef} className="w-full relative" onMouseLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="#94a3b8" />
        <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="#94a3b8" />

        {yTicks.map((v, i) => {
          const y = Y(v);
          return (
            <g key={`y-${i}`}>
              <line x1={PADL - 4} x2={W - PADR} y1={y} y2={y} stroke="#e5e7eb" />
              <text x={PADL - 10} y={y + 4} fontSize="12" textAnchor="end" fill="#1f2937">{v}</text>
            </g>
          );
        })}
        <text x={14} y={PADT + innerH / 2} fontSize="13" fontWeight={600} fill="#1f2937" transform={`rotate(-90 14 ${PADT + innerH / 2})`}>
          Person-hours per day
        </text>

        {/* Week vertical separators (every 7 days) */}
        {points.map((p, i) => (i % 7 === 0) && (
          <line key={`wk-${i}`} x1={X(i)} x2={X(i)} y1={PADT} y2={H - PADB} stroke="#e2e8f0" />
        ))}

        {/* Demand */}
        <polyline
          fill="none"
          stroke="#b91c1c"
          strokeWidth={3.2}
          points={points.map((p, i) => `${X(i)},${Y(p.demandPH)}`).join(" ")}
        />
        {/* Supply (merged with expected when liveView is enabled) */}
        <polyline
          fill="none"
          stroke="#1d4ed8"
          strokeWidth={3.2}
          points={points.map((p, i) => {
            const merged = getStateSnapshot().liveView ? (p.supplyPH + p.expectedPH) : p.supplyPH;
            return `${X(i)},${Y(merged)}`;
          }).join(" ")}
        />
        {/* Expected (campaign) */}
        <polyline
          fill="none"
          stroke="#16a34a"
          strokeWidth={3.2}
          points={points.map((p, i) => `${X(i)},${Y(p.expectedPH)}`).join(" ")}
        />

        {points.map((p, i) => (
          <g key={`pt-${i}`}>
            <circle
              cx={X(i)}
              cy={Y(p.demandPH)}
              r={2.6}
              fill="#b91c1c"
              onMouseEnter={() => setHoverIdx(i)}
            />
            <circle
              cx={X(i)}
              cy={Y(getStateSnapshot().liveView ? (p.supplyPH + p.expectedPH) : p.supplyPH)}
              r={2.6}
              fill="#1d4ed8"
              onMouseEnter={() => setHoverIdx(i)}
            />
            <circle
              cx={X(i)}
              cy={Y(p.expectedPH)}
              r={2.6}
              fill="#16a34a"
              onMouseEnter={() => setHoverIdx(i)}
            />
          </g>
        ))}

        {points.map((p, i) => i % dayStep === 0 && (
          <g key={`x-${i}`}>
            <line x1={X(i)} x2={X(i)} y1={H - PADB} y2={H - PADB + 4} stroke="#94a3b8" />
            <text x={X(i)} y={H - PADB + 16} fontSize="12" textAnchor="middle" fill="#1f2937">
              {p.dateISO.slice(5)}
            </text>
          </g>
        ))}

        <g transform={`translate(${W - 240}, ${PADT + 8})`}>
          <rect width="12" height="12" fill="#b91c1c" rx="3" />
          <text x="16" y="10" fontSize="12" fill="#1f2937">Demand</text>
          <rect x="92" width="12" height="12" fill="#1d4ed8" rx="3" />
          <text x="108" y="10" fontSize="12" fill="#1f2937">Supply</text>
        </g>
      </svg>

      {hoverPoint && (
        <div
          className="absolute bg-white border rounded shadow-md p-2 text-xs z-10"
          style={{
            left: Math.max(8, Math.min(hoverX + 12, (containerRef.current?.clientWidth || W) - 260)),
            top: Math.max(8, Math.min(hoverY + 12, H - 12)),
            maxWidth: '260px',
            pointerEvents: 'none'
          }}
        >
          <div className="font-semibold mb-1">{hoverPoint.dateISO}</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1">
            <div className="text-slate-600">Hour</div>
            <div className="text-slate-600 text-right">Demand (PH)</div>
            <div className="text-slate-600 text-right">Supply (PH)</div>
            {hoverPoint.hourLabels.map((h, idx) => (
              <React.Fragment key={idx}>
                <div>{h}</div>
                <div className="text-right">{hoverPoint.hourDemand[idx].toFixed(1)}</div>
                <div className="text-right">{hoverPoint.hourSupply[idx].toFixed(1)}</div>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t text-right">
            <span className="mr-4">Total Demand: <b>{hoverPoint.demandPH.toFixed(1)}</b></span>
            <span className="mr-4">Total Supply: <b>{hoverPoint.supplyPH.toFixed(1)}</b></span>
            <span className="text-green-700">Expected: <b>{hoverPoint.expectedPH.toFixed(1)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}


