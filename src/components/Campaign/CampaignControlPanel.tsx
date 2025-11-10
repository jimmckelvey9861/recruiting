import React, { useMemo, useState } from "react";

// =====================================================
// Compact Campaign Form + Campaigns List (no backend)
// - Fits above/next to graphs; minimal vertical space
// - Select a campaign on the left to edit/view details
// - Right pane shows the compact form with required fields
// - Refactor: removed <style> template to avoid string errors; all Tailwind utility classes
// =====================================================

const STATUS_COLORS: Record<string,string> = {
  Active: "bg-green-100 text-green-700",
  Paused: "bg-yellow-100 text-yellow-800",
  Completed: "bg-gray-200 text-gray-700",
  Pending: "bg-blue-100 text-blue-700",
  Archived: "bg-slate-100 text-slate-600",
};

const fmtMoney = (n:number) => `$${(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:0})}`;
const fmtMoney2 = (n:number) => `$${(Number(n)||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtInt = (n:number) => (Number(n)||0).toLocaleString();
const fmtDate = (s:any) => {
  if(!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toISOString().slice(0,10);
};
const safeDiv = (a:number,b:number) => (b>0? a/b : 0);

// --- demo rows
const DEMO = [
  {
    id:"C-1032", name:"Q4 Expansion", roles:["Bartender","Line Cook"], locations:["Downtown","Uptown"],
    owner:"Alex Chen", created:"2025-10-01", status:"Active", related:["C-1021","C-0999"],
    start:"2025-10-05", endPlanned:"2025-12-20", endType:"budget", endTarget:12000,
    totalBudget:15000, spent:5200, dailyCap:400,
    apps: 412, hires: 18, qIndex: 4.2,
    predictedApps: 600, predictedHires: 24,
  },
  {
    id:"C-1021", name:"Weekend Blitz", roles:["Server"], locations:["Airport"],
    owner:"Dana Ortiz", created:"2025-09-10", status:"Paused", related:["C-1032"],
    start:"2025-09-12", endPlanned:"2025-11-30", endType:"hires", endTarget:30,
    totalBudget:8000, spent:6400, dailyCap:250,
    apps: 350, hires: 21, qIndex: 3.7,
    predictedApps: 420, predictedHires: 28,
  },
  {
    id:"C-0999", name:"Holiday Surge", roles:["Host"], locations:["Mall"],
    owner:"Chris Park", created:"2025-08-15", status:"Completed", related:[],
    start:"2025-09-01", endPlanned:"2025-10-31", endType:"date", endTarget:"2025-10-31",
    totalBudget:6000, spent:5980, dailyCap:200,
    apps: 285, hires: 26, qIndex: 4.0,
    predictedApps: 280, predictedHires: 25,
  },
];

export default function CampaignControlPanel() {
  const [rows, setRows] = useState(DEMO);
  const [activeId, setActiveId] = useState(rows[0]?.id);
  const active = useMemo(()=> rows.find(r=>r.id===activeId) || rows[0], [rows, activeId]);

  // derived metrics
  const cpa = useMemo(()=> safeDiv(active?.spent||0, active?.apps||0), [active]);
  const cph = useMemo(()=> safeDiv(active?.spent||0, active?.hires||0), [active]);

  // mutate helpers (local-only)
  const patch = (k:string,v:any) => setRows(prev=> prev.map(r=> r.id===active.id ? {...r,[k]:v} : r));
  const patchArray = (k:string,arr:string[]) => setRows(prev=> prev.map(r=> r.id===active.id ? {...r,[k]:arr} : r));

  const inputBase = "w-full bg-transparent outline-none px-1 py-1 text-sm";
  const valueDisplay = "py-1 text-sm text-gray-900";

  return (
    <div className="w-full bg-white border rounded-xl p-3">
      {active && (
        <div className="space-y-3">
          {/* Row A: ID, Name, Owner, Status */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <Field label="Campaign ID" className="col-span-3">
              <input className={inputBase} value={active.id} onChange={(e)=>patch('id', e.target.value)} />
            </Field>
            <Field label="Campaign Name" className="col-span-5">
              <input className={inputBase} value={active.name} onChange={(e)=>patch('name', e.target.value)} />
            </Field>
            <Field label="Owner" className="col-span-4">
              <input className={inputBase} value={active.owner} onChange={(e)=>patch('owner', e.target.value)} />
            </Field>
            <Field label="Status" className="col-span-3">
              <select className={inputBase} value={active.status} onChange={(e)=>patch('status', e.target.value)}>
                {['Active','Paused','Completed','Pending','Archived'].map(s=> <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Related Campaigns" className="col-span-9">
              <select 
                className={inputBase} 
                value=""
                onChange={(e)=>{
                  const val = e.target.value;
                  if (val === 'link_all') {
                    const allCampaigns = rows
                      .filter(r => (r.status === 'Active' || r.status === 'Pending') && r.id !== active.id)
                      .map(r => r.id);
                    patchArray('related', allCampaigns);
                  } else if (val && !active.related.includes(val)) {
                    patchArray('related', [...active.related, val]);
                  }
                  e.target.value = ''; // Reset dropdown
                }}
              >
                <option value="">Link all campaigns</option>
                {rows
                  .filter(r => (r.status === 'Active' || r.status === 'Pending') && r.id !== active.id)
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id})
                    </option>
                  ))
                }
              </select>
              {active.related.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {active.related.map((id: string) => (
                    <span key={id} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-xs">
                      {id}
                      <button className="text-gray-500" onClick={()=> patchArray('related', active.related.filter((rid: string) => rid !== id))} aria-label="remove">×</button>
                    </span>
                  ))}
                </div>
              )}
            </Field>
          </div>

          {/* Row B: Schedule / End Criterion */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <Field label="Start Date" className="col-span-3">
              <input type="date" className={inputBase} value={fmtDate(active.start)} onChange={(e)=>patch('start', e.target.value)} />
            </Field>
            <Field label="End Date (planned)" className="col-span-3">
              <input type="date" className={inputBase} value={fmtDate(active.endPlanned)} onChange={(e)=>patch('endPlanned', e.target.value)} />
            </Field>
            <Field label="End Criterion" className="col-span-3">
              <select className={inputBase} value={active.endType} onChange={(e)=>patch('endType', e.target.value)}>
                <option value="budget">By Budget</option>
                <option value="hires">By Hires</option>
                <option value="date">By Date</option>
              </select>
            </Field>
            <Field label="End Value" className="col-span-3">
              {active.endType==='budget' && (
                <input type="number" className={`${inputBase} text-right`} value={active.endTarget as number}
                       onChange={(e)=>patch('endTarget', Math.max(0, Math.floor(Number(e.target.value||0))))} />
              )}
              {active.endType==='hires' && (
                <input type="number" className={`${inputBase} text-right`} value={active.endTarget as number}
                       onChange={(e)=>patch('endTarget', Math.max(0, Math.floor(Number(e.target.value||0))))} />
              )}
              {active.endType==='date' && (
                <input type="date" className={inputBase} value={fmtDate(active.endTarget)}
                       onChange={(e)=>patch('endTarget', e.target.value)} />
              )}
            </Field>
          </div>

          {/* Row C: Budget & Costs */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <Field label="Total Budget ($)" className="col-span-3">
              <input type="number" className={`${inputBase} text-right`} value={active.totalBudget}
                     onChange={(e)=>patch('totalBudget', Math.max(0, Math.floor(Number(e.target.value||0))))} />
            </Field>
            <Field label="Budget Used ($)" className="col-span-3">
              <div className="py-1 text-sm text-gray-900">{fmtMoney(active.spent)}</div>
            </Field>
            <Field label="Daily Cap ($)" className="col-span-3">
              <input type="number" className={`${inputBase} text-right`} value={active.dailyCap}
                     onChange={(e)=>patch('dailyCap', Math.max(0, Math.floor(Number(e.target.value||0))))} />
            </Field>
            <Field label="$/App (CPA)" className="col-span-3">
              <div className={valueDisplay}>{fmtMoney2(cpa)}</div>
            </Field>
          </div>

          {/* Row D: Funnel Metrics */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <Field label="Applications" className="col-span-3">
              <div className="py-1 text-sm text-gray-900">{fmtInt(active.apps)}</div>
            </Field>
            <Field label="Hires" className="col-span-3">
              <div className="py-1 text-sm text-gray-900">{fmtInt(active.hires)}</div>
            </Field>
            <Field label="$/Hire" className="col-span-3">
              <div className={valueDisplay}>{cph? fmtMoney2(cph) : "$0.00"}</div>
            </Field>
            <Field label="Applicant Quality" className="col-span-3">
              <div className="py-1 text-sm text-gray-900">{Number.isFinite(active?.qIndex) ? (active.qIndex).toFixed(1) : '—'}</div>
            </Field>
          </div>

          {/* Row E: Prediction vs Actual */}
          <div className="grid grid-cols-12 gap-2 items-center">
            <Field label="Predicted Applicants (vs. Actual)" className="col-span-6">
              <div className="flex items-center gap-2 py-1 text-sm text-gray-900">
                <span>Pred: {fmtInt(active.predictedApps)}</span>
                <span>Actual: {fmtInt(active.apps)}</span>
              </div>
            </Field>
            <Field label="Predicted Hires (vs. Actual)" className="col-span-6">
              <div className="flex items-center gap-2 py-1 text-sm text-gray-900">
                <span>Pred: {fmtInt(active.predictedHires)}</span>
                <span>Actual: {fmtInt(active.hires)}</span>
              </div>
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({label, className, children}:{label:string; className?:string; children:any}){
  return (
    <div className={`relative bg-white border border-gray-200 rounded-lg px-3 pt-2 pb-2 ${className||''}`}>
      <div className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-gray-500">{label}</div>
      {children}
    </div>
  );
}

