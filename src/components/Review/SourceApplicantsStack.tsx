import React, { useMemo } from 'react';
import { getStateSnapshot, useCampaignPlanVersion, isScheduledOn } from '../../state/campaignPlan';

type Part = { key: string; label: string; color: string; apps: number; spend: number };
type Row = { date: Date; parts: Part[]; total: number };

export default function SourceApplicantsStack({ items }: { items: Part[] }) {
  const planVersion = useCampaignPlanVersion();
  const state = getStateSnapshot();
  const planner = state.planner;
  const startISO = planner.startDate;

  const days: Date[] = useMemo(() => {
    const out: Date[] = [];
    if (!startISO) return out;
    const start = new Date(startISO);
    
    // Determine campaign length based on end criterion
    let n = 7; // fallback
    if (planner.endType === 'date' && planner.endValue != null) {
      n = Math.max(1, Math.round(Number(planner.endValue)));
    } else if (planner.endType === 'hires' && planner.endValue != null) {
      const hiresPerDay = state.conversionRate > 0 
        ? (getStateSnapshot().planner.dailySpend || 0) * state.conversionRate 
        : 0.1;
      n = hiresPerDay > 0 
        ? Math.max(1, Math.ceil(Number(planner.endValue) / hiresPerDay))
        : 7;
    } else if (planner.endType === 'budget' && planner.endValue != null) {
      const dailySpend = Math.max(1, Number(planner.dailySpend || 1));
      n = Math.max(1, Math.ceil(Number(planner.endValue) / dailySpend));
    }
    
    for (let i = 0; i < n; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    return out;
  }, [startISO, planVersion, planner.endType, planner.endValue, planner.dailySpend, state.conversionRate]);

  const rows: Row[] = useMemo(() => {
    return days.map((date) => {
      if (!isScheduledOn(date)) return { date, parts: [], total: 0 };
      const parts = items.map((it) => ({ ...it }));
      const total = parts.reduce((a, p) => a + Math.max(0, p.apps), 0);
      return { date, parts, total };
    });
  }, [days, planVersion, items]);

  if (!startISO || days.length === 0) {
    return <div className="mt-3 text-xs text-gray-500">No campaign window; set a start date on the Plan tab.</div>;
  }

  // Render stacked bars
  const W = 600;
  const H = 140;
  const PAD_LEFT = 40; // more room for Y-axis labels
  const PAD_RIGHT = 24;
  const PAD_TOP = 12;
  const PAD_BOTTOM = 24;
  const innerW = W - PAD_LEFT - PAD_RIGHT;
  const barW = innerW / Math.max(1, days.length);
  const maxYRaw = Math.max(1, ...rows.map(r => r.total));
  const maxY = maxYRaw * 1.5; // 150% of max for headroom
  const yScale = (v: number) => H - PAD_BOTTOM - (v / maxY) * (H - PAD_TOP - PAD_BOTTOM);

  // Y-axis tick values (0, 50%, 100%, 150% of raw max)
  const yTicks = [0, maxYRaw * 0.5, maxYRaw, maxYRaw * 1.5];

  // X-axis labels: show at most 10 evenly spaced
  const xLabelIndices: number[] = [];
  if (rows.length <= 10) {
    for (let i = 0; i < rows.length; i++) xLabelIndices.push(i);
  } else {
    const step = Math.floor(rows.length / 10);
    for (let i = 0; i < rows.length; i += step) {
      xLabelIndices.push(i);
    }
    if (!xLabelIndices.includes(rows.length - 1)) {
      xLabelIndices.push(rows.length - 1);
    }
  }

  return (
    <div className="mt-6">
      <div className="text-sm font-semibold text-gray-700 mb-2">Daily applicants by source</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {/* axes */}
        <line x1={PAD_LEFT} y1={H - PAD_BOTTOM} x2={W - PAD_RIGHT} y2={H - PAD_BOTTOM} stroke="#cbd5e1" />
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={H - PAD_BOTTOM} stroke="#cbd5e1" />
        
        {/* Y-axis label */}
        <text x={8} y={H / 2 + 120} fontSize="10" fill="#64748b" textAnchor="middle" transform={`rotate(-90 8,${H / 2 + 120})`}>
          Applicants
        </text>
        
        {/* X-axis label */}
        <text x={(W - PAD_RIGHT) - 20} y={H - 6} fontSize="10" fill="#64748b">
          Days
        </text>
        
        {/* y grid + labels */}
        {yTicks.map((val, i) => {
          const y = yScale(val);
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="#e2e8f0" />
              <text x={PAD_LEFT - 4} y={y + 3} fontSize="9" fill="#64748b" textAnchor="end">
                {Math.round(val)}
              </text>
            </g>
          );
        })}
        
        {/* x labels (max 10) */}
        {xLabelIndices.map((i) => {
          const r = rows[i];
          if (!r) return null;
          const x = PAD_LEFT + i * barW + Math.max(1, barW - 2) / 2;
          const label = `${r.date.getMonth()+1}/${r.date.getDate()}`;
          return (
            <text key={`xl-${i}`} x={x} y={H - PAD_BOTTOM + 12} fontSize="9" fill="#94a3b8" textAnchor="middle">
              {label}
            </text>
          );
        })}
        
        {/* bars */}
        {rows.map((r, i) => {
          const x = PAD_LEFT + i * barW + 1;
          let yTop = H - PAD_BOTTOM;
          return (
            <g key={i}>
              {r.parts.map((p, j) => {
                const h = (p.apps / maxY) * (H - PAD_TOP - PAD_BOTTOM);
                const y = yTop - h;
                yTop = y;
                return <rect key={j} x={x} y={y} width={Math.max(1, barW - 2)} height={h} fill={p.color} opacity={0.85} />;
              })}
            </g>
          );
        })}
      </svg>
      {/* Debug readout: per-source apps/day and $/day */}
      <div className="mt-2 text-xs text-slate-600">
        {items.map((it) => {
          const appsStr = Number(it.apps).toLocaleString(undefined, { maximumFractionDigits: 3 });
          const spendStr = `$${Math.round(Number(it.spend || 0)).toLocaleString()}`;
          return (
            <div key={`dbg-${it.key}`} className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: it.color }} />
              <span>{it.label} - {appsStr} applicants/day at {spendStr}/day</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
