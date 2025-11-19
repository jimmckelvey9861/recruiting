import React, { useEffect, useMemo, useRef, useState } from "react";
import { SOURCE_COLORS } from '../../constants/sourceColors';
import { useCampaignPlanVersion, getApplicantsPerDay as getAppsPerDay, getHiresPerDay, getStateSnapshot, getDerivedFromCriterion, setPlanner, setConversionRate, getMaxDailySpendCap } from '../../state/campaignPlan';

// ===============================
// Campaign Manager – compact, robust single file (JSX only)
// ===============================

// ---- helpers
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
const safeISO = (d: Date | string | number) => {
  const now = new Date();
  let dt: Date;
  if (d instanceof Date) dt = d;
  else if (typeof d === 'string' || typeof d === 'number') dt = new Date(d);
  else dt = now;
  if (Number.isNaN(dt.getTime())) dt = now;
  return dt.toISOString().slice(0, 10);
};
const isoDate = (d: Date | string | number) => safeISO(d);

// Fix timezone issue: parse ISO date string as local date, not UTC
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Format date for display without timezone shifts
const formatDate = (dateStr: string): string => {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface Source {
  key: string;
  enabled: boolean;
  dailyCap: number;
  dailyBudget: number;
  cpa: number;
}

interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  sources: Source[];
  status: 'active' | 'suspended' | 'draft';
  owners?: string[];
  notes?: string;
  dailyCapGuard?: number;
  relatedIds?: string[];
  locations: string[];
  jobs: string[];
  startDate: string;
  endDate?: string;
  endBudget?: number;
  endHires?: number;
  endMode: 'date' | 'budget' | 'hires';
}

// ---- demo data
const DEFAULT_SOURCES: Source[] = [
  { key: 'indeed',     enabled: true,  dailyCap: 40, dailyBudget: 300, cpa: 18.43 },
  { key: 'facebook',   enabled: true,  dailyCap: 35, dailyBudget: 250, cpa: 23.12 },
  { key: 'craigslist', enabled: true,  dailyCap: 14, dailyBudget:  65, cpa: 12.40 },
  { key: 'referrals',  enabled: true,  dailyCap: 12, dailyBudget:  55, cpa:  6.25 },
  { key: 'qr_posters', enabled: false, dailyCap:  0, dailyBudget:   0, cpa:  0.00 },
];

const CAMPAIGNS: Campaign[] = [
  { id:'c8', name:'Dummy for Jimmy', createdAt:'2025-11-10', sources: DEFAULT_SOURCES, status: 'active', locations: ['BOS'], jobs: ['Server'], startDate: '2025-11-10', endDate: '2025-11-22', endMode: 'date' },
  { id:'c7', name:'Summer Hiring Blitz', createdAt:'2025-11-01', sources: DEFAULT_SOURCES, status: 'active', locations: ['BOS', 'LGA'], jobs: ['Server', 'Host'], startDate: '2025-11-01', endDate: '2025-12-15', endMode: 'date' },
  { id:'c6', name:'Q4 Expansion', createdAt:'2025-10-25', sources: DEFAULT_SOURCES, status: 'suspended', locations: ['DCA'], jobs: ['Cook', 'Server'], startDate: '2025-10-25', endBudget: 5000, endMode: 'budget' },
  { id:'c5', name:'Weekend Warriors', createdAt:'2025-10-18', sources: DEFAULT_SOURCES, status: 'active', locations: ['BOS'], jobs: ['Bartender', 'Server'], startDate: '2025-10-18', endHires: 15, endMode: 'hires' },
  { id:'c4', name:'New Menu Launch', createdAt:'2025-10-15', sources: DEFAULT_SOURCES, status: 'active', locations: ['LGA', 'DCA'], jobs: ['Cook'], startDate: '2025-10-15', endDate: '2025-11-30', endMode: 'date' },
  { id:'c3', name:'New Location Opening', createdAt:'2025-10-14', sources: DEFAULT_SOURCES, status: 'active', locations: ['ORD'], jobs: ['Cook', 'Server', 'Host'], startDate: '2025-10-14', endDate: '2025-12-01', endMode: 'date' },
  { id:'c2', name:'Weekend Staffing', createdAt:'2025-09-28', sources: DEFAULT_SOURCES, status: 'suspended', locations: ['BOS', 'LGA'], jobs: ['Server'], startDate: '2025-09-28', endBudget: 3000, endMode: 'budget' },
  { id:'c1', name:'Holiday Surge', createdAt:'2025-08-31', sources: DEFAULT_SOURCES, status: 'active', locations: ['BOS'], jobs: ['Cook', 'Server', 'Bartender'], startDate: '2025-08-31', endDate: '2025-12-25', endMode: 'date' },
];

// Compact, single-line multi-select dropdown with checkboxes
function CompactMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select…',
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const label = (() => {
    if (!selected || selected.length === 0) return placeholder;
    const labels = options.filter(o => selected.includes(o.value)).map(o => o.label);
    return labels.join(', ');
  })();
  const toggle = (val: string) => {
    const has = selected.includes(val);
    const next = has ? selected.filter(v => v !== val) : [...selected, val];
    onChange(next);
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="w-full h-8 text-sm border rounded px-2 flex items-center justify-between overflow-hidden"
        onClick={() => setOpen(v => !v)}>
        <span className={`truncate ${(!selected || selected.length===0) ? 'text-gray-400' : ''}`}>{label}</span>
        <svg viewBox="0 0 20 20" className="w-4 h-4 text-gray-500 ml-2" fill="none" stroke="currentColor"><path d="M6 8l4 4 4-4"/></svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-white border rounded shadow">
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={()=> toggle(opt.value)} />
              <span className="truncate">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const applicantsPerDay = (s: Source) => {
  if (!s.enabled || s.cpa <= 0 || s.dailyBudget <= 0) return 0;
  const est = s.dailyBudget / s.cpa;
  return s.dailyCap > 0 ? Math.min(est, s.dailyCap) : est;
};

interface CampaignManagerProps {
  selectedLocations: string[];
  setSelectedLocations: (locations: string[]) => void;
  selectedJobs: string[];
  setSelectedJobs: (jobs: string[]) => void;
  onOpenPlanner?: () => void;
  onOpenSources?: () => void;
}

export default function CampaignManager({ selectedLocations, setSelectedLocations, selectedJobs, setSelectedJobs, onOpenPlanner, onOpenSources }: CampaignManagerProps){
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => {
    try {
      const raw = localStorage.getItem('passcom-campaigns-v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          return parsed as Campaign[];
        }
      }
    } catch {}
    return [...CAMPAIGNS].sort((a,b)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  });
  const [activeId, setActiveId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('passcom-campaign-active');
      if (saved) return saved;
    } catch {}
    return (campaigns[0]?.id || '');
  });
  const current = useMemo(()=> campaigns.find(c=>c.id===activeId) || campaigns[0], [campaigns, activeId]);

  // Shared planner KPIs
  const _ver = useCampaignPlanVersion();
  const appsPerDay = getAppsPerDay();
  const hiresPerDay = getHiresPerDay();
  const spendPerDay = Math.max(0, Number(getStateSnapshot().planner.dailySpend || 0));
  const costPerHire = hiresPerDay > 0 ? spendPerDay / hiresPerDay : 0;
  const planner = getStateSnapshot().planner;
  const derived = getDerivedFromCriterion({
    startISO: planner.startDate,
    endType: planner.endType,
    endValue: planner.endValue,
    dailySpend: planner.dailySpend,
  });
  const targetPerDay = derived.days > 0 ? (derived.hires / derived.days) : hiresPerDay;

  // Utility: estimate simple to-date metrics from start date
  const daysFrom = (iso: string | null | undefined) => {
    if (!iso) return 0;
    const s = parseLocalDate(iso);
    const now = new Date();
    s.setHours(0,0,0,0);
    now.setHours(0,0,0,0);
    const diff = Math.floor((now.getTime() - s.getTime())/(1000*60*60*24));
    return Math.max(0, diff);
  };
  const startISO = planner.startDate || (current?.startDate ?? null);
  const daysSinceStart = daysFrom(startISO);
  const applicantsToDate = Math.max(0, Math.round(appsPerDay * daysSinceStart));
  const hiresToDate = Math.max(0, Math.round(hiresPerDay * daysSinceStart));
  const spendToDate = Math.max(0, Math.round(spendPerDay * daysSinceStart));

  // Targets/projections
  const targetHires = Math.max(0, Math.round(derived.hires));
  const expectedHiresByNow = derived.days > 0 ? Math.round(targetHires * Math.min(1, daysSinceStart / Math.max(1, Math.round(derived.days)))) : 0;
  const varianceHires = hiresToDate - expectedHiresByNow; // + ahead, - behind
  const paceLabel = (() => {
    if (derived.days <= 0 || targetHires <= 0) return '—';
    const tol = Math.max(1, Math.round(0.05 * expectedHiresByNow));
    if (hiresToDate > expectedHiresByNow + tol) return 'ahead';
    if (hiresToDate < expectedHiresByNow - tol) return 'behind';
    return 'on‑track';
  })();
  const projectedSpendAtCompletion = derived.days > 0 ? Math.round(spendPerDay * Math.round(derived.days)) : 0;
  const burnMeter = (() => {
    if (planner.endType !== 'budget' || !planner.endValue || derived.days <= 0) return { ratio: 0, text: '—' };
    const totalBudget = Math.max(0, Number(planner.endValue||0));
    const budgetLeft = Math.max(0, totalBudget - spendToDate);
    const daysRemaining = Math.max(1, Math.round(derived.days) - daysSinceStart);
    const suggestedDaily = budgetLeft / daysRemaining;
    const ratio = suggestedDaily > 0 ? Math.min(2, spendPerDay / suggestedDaily) : 0;
    return { ratio, text: `${Math.round(spendPerDay)}/${Math.round(suggestedDaily)} $/day` };
  })();

  // Compute slider cap from active sources (mirrors Review panel)
  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap();
    return Math.max(0, cap);
  }, [_ver]);

  // Mini progress chart data (10 bars max, 45° dotted target)
  const progressChart = useMemo(() => {
    const totalDays = Math.max(1, Math.round(derived.days || 1));
    const bins = Math.max(1, Math.min(10, totalDays));
    const binSize = Math.max(1, Math.ceil(totalDays / bins));
    const target = Math.max(0, Math.round(derived.hires || 0));
    const startLabel = startISO ? formatDate(startISO) : 'Start';
    const endLabel = derived.endDate ? formatDate(derived.endDate) : 'End';

    const bars = Array.from({ length: bins }, (_, i) => {
      const dayEnd = Math.min(totalDays, (i + 1) * binSize);
      const actualDays = Math.min(dayEnd, daysSinceStart);
      const expected = totalDays > 0 ? (target * (dayEnd / totalDays)) : 0;
      const actual = hiresPerDay * actualDays;
      const ratioActual = target > 0 ? Math.min(1, actual / target) : 0;
      const ratioExpected = target > 0 ? Math.min(1, expected / target) : 0;
      const isAhead = actual >= expected;
      return { ratioActual, ratioExpected, isAhead };
    });
    return { bins, bars, target, startLabel, endLabel };
  }, [derived.days, derived.hires, derived.endDate, daysSinceStart, hiresPerDay, startISO]);

  // Alerts
  const stateSnap = getStateSnapshot();
  const activeSources = (stateSnap.sources||[]).filter(s=> s.active);
  const alerts: string[] = [];
  if (!startISO) alerts.push('Missing start date.');
  if (stateSnap.planner.dailySpend <= 0) alerts.push('Daily spend is zero.');
  if (activeSources.length === 0) alerts.push('No active sources.');
  if (!planner.endValue) alerts.push('Missing end value for selected criterion.');

  const handleSelectCampaign = (campaign: Campaign) => {
    setActiveId(campaign.id);
    // Update global selections
    setSelectedLocations(campaign.locations);
    setSelectedJobs(campaign.jobs);
  };

  // Sidebar actions
  const handleToggleStatus = () => {
    if (!current) return;
    const now = new Date(); now.setHours(0,0,0,0);
    const start = current.startDate ? parseLocalDate(current.startDate) : null;
    if (start) start.setHours(0,0,0,0);
    setCampaigns(prev => prev.map(c => {
      if (c.id !== current.id) return c;
      // Pause if active
      if (c.status === 'active') return { ...c, status: 'suspended' };
      // Launch from paused/pending: if start is in the future -> pending (draft), else active
      const shouldBePending = !!(start && start.getTime() > now.getTime());
      const nextStatus: Campaign['status'] = shouldBePending ? 'draft' : 'active';
      return { ...c, status: nextStatus };
    }));
  };
  const handleCopy = () => {
    if (!current) return;
    const copied: Campaign = {
      ...current,
      id: `c${Date.now()}`,
      name: `${current.name} (Copy)`,
      status: 'suspended',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    setCampaigns(prev => [copied, ...prev]);
    setActiveId(copied.id);
  };
  const handleDelete = () => {
    if (!current) return;
    if (!window.confirm(`Delete campaign "${current.name}"?`)) return;
    setCampaigns(prev => prev.filter(c => c.id !== current.id));
    const remaining = campaigns.filter(c => c.id !== current.id);
    if (remaining.length > 0) setActiveId(remaining[0].id);
  };
  const saveNow = () => {
    try {
      localStorage.setItem('passcom-campaigns-v1', JSON.stringify(campaigns));
      localStorage.setItem('passcom-campaign-active', activeId || '');
    } catch {}
  };
  // Auto-persist when data changes
  useEffect(() => { saveNow(); }, [campaigns, activeId]);
  // Also persist when tab/window loses focus or before unload
  useEffect(() => {
    const onVis = () => { if (document.hidden) saveNow(); };
    const onBeforeUnload = () => { saveNow(); };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [campaigns, activeId]);

  // Defensive sync: if planner.startDate changes elsewhere, reflect into the selected campaign
  useEffect(() => {
    const plannerISO = getStateSnapshot().planner.startDate || '';
    const curISO = current?.startDate || '';
    if (!current || !plannerISO || plannerISO === curISO) return;
    setCampaigns(prev =>
      prev.map(c => c.id === current.id ? ({ ...c, startDate: plannerISO }) : c)
    );
    try { localStorage.setItem('passcom-campaign-active', current.id); } catch {}
  }, [current?.id, getStateSnapshot().planner.startDate]);

  // Defensive sync: if campaign.startDate changes (e.g., from list editor), mirror to planner
  useEffect(() => {
    if (!current) return;
    const plannerISO = getStateSnapshot().planner.startDate || '';
    const curISO = current.startDate || '';
    if (curISO && curISO !== plannerISO) {
      setPlanner({ startDate: curISO });
    }
  }, [current?.startDate]);

  // Do not auto-sync or warn on header job changes when switching tabs.
  // Job focus changes should only occur via an explicit editor control (not implemented here).

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-4">
        {/* LEFT: Campaign list */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <CampaignsWindow
            campaigns={campaigns}
            activeId={activeId}
            setActiveId={setActiveId}
            setCampaigns={setCampaigns}
            onSelectCampaign={handleSelectCampaign}
            selectedLocations={selectedLocations}
            selectedJobs={selectedJobs}
          />
        </div>

        {/* CENTER: Campaign Detail */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9">
          <div className="bg-white border rounded-xl p-4 h-full flex flex-col">
            {/* New two-column layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* LEFT COLUMN */}
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Name</div>
                  <input
                    value={current?.name || ''}
                    onChange={e=>{
                      const val = e.target.value;
                      setCampaigns(prev=> prev.map(c=> c.id===(current?.id||'')? ({...c, name: val}): c));
                    }}
                    className="w-full text-sm border rounded px-2 py-1 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">ID</div>
                    <input
                      value={current?.id || ''}
                      onChange={e=>{
                        const val = e.target.value.trim();
                        setCampaigns(prev=> prev.map(c=> c.id===(current?.id||'')? ({...c, id: val}): c));
                        setActiveId(val);
                      }}
                      className="w-full text-sm border rounded px-2 py-1 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 mb-1">Owner</div>
                    {(() => {
                      const ALL_USERS = ['alice', 'bob', 'carol', 'dave'];
                      const value = (current?.owners || []);
                      const opts = ALL_USERS.map(u=> ({ value: u, label: u }));
                      return (
                        <CompactMultiSelect
                          options={opts}
                          selected={value}
                          onChange={(sel)=> setCampaigns(prev=> prev.map(c=> c.id===(current?.id||'')? ({...c, owners: sel}): c))}
                          placeholder="Select owners"
                        />
                      );
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Links</div>
                  {(() => {
                    const linkable = (campaigns||[])
                      .filter(c=> c.id !== (current?.id||'') && (c.status as any) !== 'completed' && (c.status as any) !== 'finished');
                    const ids = (current?.relatedIds || []);
                    const opts = linkable
                      .sort((a,b)=> (a.name||'').localeCompare(b.name||''))
                      .map(c=> ({ value: c.id, label: c.name }));
                    return (
                      <CompactMultiSelect
                        options={opts}
                        selected={ids}
                        onChange={(sel)=> setCampaigns(prev=> prev.map(c=> c.id===(current?.id||'')? ({...c, relatedIds: sel}): c))}
                        placeholder="Select campaigns"
                      />
                    );
                  })()}
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Start Date</div>
                  <input
                    type="date"
                    value={current?.startDate || ''}
                    onChange={(e) => {
                      const iso = e.target.value || '';
                      // Update selected campaign's start date
                      setCampaigns(prev =>
                        prev.map(c => c.id === (current?.id || '') ? ({ ...c, startDate: iso }) : c)
                      );
                      // Keep planner in sync for visuals/derived
                      setPlanner({ startDate: iso });
                    }}
                    className="w-full text-sm border rounded px-2 py-1 outline-none"
                  />
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">End Goal</div>
                  <div className="grid grid-cols-12 gap-2 items-center text-sm">
                    <label className="col-span-4 flex items-center gap-2">
                      <input
                        type="radio"
                        name="endc2"
                        checked={planner.endType==='date'}
                        onChange={()=>{
                          const seedDays = Math.max(0, Math.round(derived.days || 0));
                          setPlanner({ endType: 'date', endValue: seedDays });
                        }}
                      />
                      <span>Date</span>
                    </label>
                    <div className="col-span-8">
                      <input
                        type={planner.endType==='date' ? 'date' : 'text'}
                        className={`w-full text-sm border rounded px-2 py-1 outline-none text-right ${planner.endType!=='date' ? 'bg-slate-100 text-blue-700' : ''}`}
                        readOnly={planner.endType!=='date'}
                        value={derived.endDate || ''}
                        onChange={(e)=>{
                          const endISO = e.target.value || '';
                          if (!planner.startDate || !endISO) return setPlanner({ endValue: null as any });
                          const s = parseLocalDate(planner.startDate);
                          const d = parseLocalDate(endISO);
                          s.setHours(0,0,0,0); d.setHours(0,0,0,0);
                          const days = Math.max(0, Math.floor((d.getTime()-s.getTime())/(1000*60*60*24)));
                          setPlanner({ endValue: days });
                        }}
                      />
                    </div>
                    <label className="col-span-4 flex items-center gap-2">
                      <input
                        type="radio"
                        name="endc2"
                        checked={planner.endType==='hires'}
                        onChange={()=>{
                          const seedHires = Math.max(0, Math.round(derived.hires || 0));
                          setPlanner({ endType: 'hires', endValue: seedHires });
                        }}
                      />
                      <span>Hires</span>
                    </label>
                    <div className="col-span-8">
                      <input
                        type={planner.endType==='hires' ? 'number' : 'text'}
                        className={`w-full text-sm border rounded px-2 py-1 outline-none text-right ${planner.endType!=='hires' ? 'bg-slate-100 text-blue-700' : ''}`}
                        readOnly={planner.endType!=='hires'}
                        value={planner.endType==='hires' ? Math.max(0, Number(planner.endValue||0)) : Math.round(derived.hires)}
                        onChange={(e)=> setPlanner({ endValue: Math.max(0, Number(e.target.value||0)) })}
                      />
                    </div>
                    <label className="col-span-4 flex items-center gap-2">
                      <input
                        type="radio"
                        name="endc2"
                        checked={planner.endType==='budget'}
                        onChange={()=>{
                          const seedBudget = Math.max(0, Math.round(derived.budget || 0));
                          setPlanner({ endType: 'budget', endValue: seedBudget });
                        }}
                      />
                      <span>Budget</span>
                    </label>
                    <div className="col-span-8">
                      <input
                        type={planner.endType==='budget' ? 'number' : 'text'}
                        className={`w-full text-sm border rounded px-2 py-1 outline-none text-right ${planner.endType!=='budget' ? 'bg-slate-100 text-blue-700' : ''}`}
                        readOnly={planner.endType!=='budget'}
                        value={planner.endType==='budget' ? Math.max(0, Number(planner.endValue||0)) : Math.round(derived.budget)}
                        onChange={(e)=> setPlanner({ endValue: Math.max(0, Number(e.target.value||0)) })}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-gray-500 mb-1">Daily Spend</div>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={sliderMax} step={10} value={Math.min(planner.dailySpend, sliderMax)} onChange={e=> setPlanner({ dailySpend: Number(e.target.value||0) })} className="flex-1" />
                    <input type="number" min={0} max={sliderMax} step={10} value={Math.min(planner.dailySpend, sliderMax)} onChange={e=> setPlanner({ dailySpend: Math.max(0, Math.min(sliderMax, Number(e.target.value||0))) })} className="w-28 text-sm border rounded px-2 py-1 outline-none text-right" />
                  </div>
                  {Number.isFinite(sliderMax) && (planner.dailySpend >= sliderMax || Math.abs(Math.min(planner.dailySpend, sliderMax) - sliderMax) <= 5) && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      Maximum spend limit. To increase, enable more sources.
                      <button
                        className="ml-2 underline text-amber-800"
                        onClick={()=>{
                          if (onOpenSources) onOpenSources();
                          else {
                            try {
                              localStorage.setItem('passcom-recruiting-active-tab','review');
                              window.location.reload();
                            } catch {}
                          }
                        }}
                      >
                        Open Sources
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-3">
                {/* Status + Actions */}
                <div className="flex items-center justify-between">
                  <div>
                    {(() => {
                      const mapText = (s?: string) => s==='active' ? 'Active' : s==='suspended' ? 'Paused' : s==='draft' ? 'Launched' : 'Finished';
                      const mapColor = (s?: string) => s==='active' ? 'bg-green-100 text-green-700' : s==='suspended' ? 'bg-yellow-100 text-yellow-700' : s==='draft' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700';
                      return <span className={`px-3 py-1 rounded-full text-xs font-medium ${mapColor(current?.status)}`}>{mapText(current?.status)}</span>;
                    })()}
                  </div>
                <div className="flex items-center gap-3">
                    <button onClick={handleToggleStatus} className="px-3 py-1.5 rounded border text-sm">
                      {current?.status === 'active' ? 'Pause' : 'Launch'}
                    </button>
                  <button onClick={saveNow} className="px-3 py-1.5 rounded border text-sm">Save</button>
                    <button onClick={handleCopy} className="text-sm text-gray-700 underline">Copy</button>
                    <button onClick={handleDelete} className="text-sm text-red-600 underline">Delete</button>
                  </div>
                </div>
                {/* Progress Graph */}
                <div className="relative border rounded-lg p-3">
                  <div className="absolute -top-2 left-2 bg-white px-1 text-sm font-semibold text-gray-700">Progress</div>
                  <div className="w-full h-48">
                    <svg viewBox="0 0 520 220" className="w-full h-full">
                      {(() => {
                        // Plot box
                        const W = 520, H = 220;
                        // Placement: 15px from left, >=15px from bottom
                        const PADL = 15, PADR = 14, PADT = 16, PADB = 28;
                        const innerW = W - PADL - PADR, innerH = H - PADT - PADB;
                        const D = Math.max(1, Math.round(derived.days || 1));
                        const target = Math.max(0, Math.round(derived.hires || 0));
                        const startLbl = startISO ? formatDate(startISO) : 'Start';
                        const endLbl = derived.endDate ? formatDate(derived.endDate) : 'End';
                        // Division logic
                        const block = D <= 12 ? 1 : Math.ceil(D / 12);
                        const N = Math.ceil(D / block);
                        const dayEndFor = (i: number) => Math.min(D, (i + 1) * block);
                        // Scales
                        const barGap = 6;
                        const barW = Math.max(8, (innerW - barGap * (N - 1)) / N);
                        const Xbar = (i: number) => PADL + i * (barW + barGap); // first bar starts exactly PADL from left
                        const Y = (v: number) => PADT + innerH - (target > 0 ? (v / target) * innerH : 0);
                        // Labels: top Y, bottom X
                        const daysNow = ((current?.name || '').toLowerCase() === 'dummy for jimmy')
                          ? Math.min(D, 7)
                          : Math.max(0, Math.min(D, daysSinceStart));
                        return (
                          <>
                            {/* Axes */}
                            <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke="#e5e7eb" />
                            <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke="#e5e7eb" />
                            {/* Axis labels and ticks */}
                            {/* Y top label = total hires */}
                            <text x={PADL} y={PADT - 2} textAnchor="start" className="fill-gray-700" style={{ fontSize: 13, fontWeight: 600 }}>{target}</text>
                            {/* X labels */}
                            <text x={PADL} y={H - 6} textAnchor="start" className="fill-gray-600" style={{ fontSize: 14 }}>{startLbl}</text>
                            <text x={W - PADR} y={H - 6} textAnchor="end" className="fill-gray-600" style={{ fontSize: 14 }}>{endLbl}</text>
                            {/* Bars */}
                            {Array.from({ length: N }).map((_, i) => {
                              const x = Xbar(i);
                              const dayEnd = dayEndFor(i);
                              const expectedCum = D > 0 ? (target * (dayEnd / D)) : 0;
                              const actualDays = Math.min(dayEnd, daysNow);
                              let actualCum = Math.max(0, hiresPerDay * actualDays);
                              // Dummy variation for "Dummy for Jimmmy": oscillate around expected
                              if ((current?.name || '').toLowerCase() === 'dummy for jimmy') {
                                const factor = 1 + 0.25 * Math.sin((i + 1) * 1.1);
                                actualCum = Math.min(target, Math.max(0, expectedCum * factor));
                              }
                              const expH = Math.max(0, innerH - (Y(expectedCum) - PADT));
                              const actH = Math.max(0, innerH - (Y(actualCum) - PADT));
                              const baseY = Y(Math.max(expectedCum, actualCum)); // tallest top
                              const expY = Y(expectedCum);
                              const actY = Y(actualCum);
                              // Draw baseline expected in gray up to expected
                              const grayY = expY;
                              const grayH = innerH - (grayY - PADT);
                              // Overlay: green if actual >= expected else red (shortfall)
                              const overColor = actualCum >= expectedCum ? '#21BF6B' : '#D72A4D';
                              const overY = actY;
                              const overH = innerH - (overY - PADT);
                              return (
                                <g key={i}>
                                  {/* Gray expected */}
                                  <rect x={x} y={grayY} width={barW} height={Math.max(0, grayH)} fill="#cbd5e1" rx="2" />
                                  {/* Overlay actual */}
                                  <rect
                                    x={x}
                                    y={overY}
                                    width={barW}
                                    height={Math.max(0, overH)}
                                    fill={overColor}
                                    opacity={actualCum >= expectedCum ? 0.55 : 0.9}
                                    rx="2"
                                  />
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
                {/* Sources Graph */}
                <div className="relative border rounded-lg p-3">
                  <div className="absolute -top-2 left-2 bg-white px-1 text-sm font-semibold text-gray-700">Sources</div>
                  <button
                    className="absolute -top-2 right-2 bg-white px-1 text-[11px] text-blue-600 underline"
                    onClick={()=>{
                      if (onOpenSources) onOpenSources();
                      else {
                        try {
                          localStorage.setItem('passcom-recruiting-active-tab','review');
                          window.location.reload();
                        } catch {}
                      }
                    }}
                    title="Manage sources"
                  >
                    Manage sources
                  </button>
                  <SourceMixMini />
                </div>
                {/* Summary Squares */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Applicants</div>
                    <div className="text-2xl font-semibold">{applicantsToDate}</div>
                    <div className="text-xs text-gray-500 mt-1">${(applicantsToDate>0 ? Math.round((spendToDate/applicantsToDate)*100)/100 : 0)}/app</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Hires</div>
                    <div className="text-2xl font-semibold">{hiresToDate}</div>
                    <div className="text-xs text-gray-500 mt-1">${(hiresToDate>0 ? Math.round((spendToDate/hiresToDate)*100)/100 : 0)}/hire</div>
                  </div>
                  <div className="border rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-500 mb-1">Spend</div>
                    <div className="text-2xl font-semibold">${spendToDate}</div>
                    <div className="text-xs text-gray-500 mt-1">${Math.round(spendPerDay)}/day</div>
                  </div>
                </div>
              </div>
            </div>
            {/* bottom analytics removed per request */}
          </div>
        </div>

        {/* RIGHT column removed per request */}
      </div>
    </div>
  );
}

// ===============================
// Field Component (outside to prevent recreation)
// ===============================
const Field = ({label, children, active = false}: {label: string; children: React.ReactNode; active?: boolean})=> (
  <div className={`relative border rounded-md px-2 pt-2 pb-1 bg-white min-h-[38px] ${active ? 'border-gray-600' : 'border-gray-400'}`}>
    <div className="absolute left-2 -top-2 bg-white px-1 text-[11px] text-gray-500">{label}</div>
    {children}
  </div>
);

// ===============================
// CampaignEditor - Compact single-row campaign editor
// ===============================
interface CampaignEditorProps {
  current: Campaign | undefined;
  campaigns: Campaign[];
  activeId: string;
  setActiveId: (id: string) => void;
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  dateRange: { start: string; end: string };
  setDateRange: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
  selectedLocations: string[];
  selectedJobs: string[];
}

function CampaignEditor(props: CampaignEditorProps) {
  const {
    current,
    campaigns,
    activeId,
    setActiveId,
    setCampaigns,
    dateRange: incomingDateRange,
    setDateRange,
    selectedLocations,
    selectedJobs,
  } = props;

  const today = new Date();
  const defaultStart = isoDate(today);
  const tmpEnd = new Date(today); tmpEnd.setDate(today.getDate()+30);
  const defaultEnd = isoDate(tmpEnd);
  const dateRange = (incomingDateRange && typeof incomingDateRange === 'object')
    ? { start: incomingDateRange.start || defaultStart, end: incomingDateRange.end || defaultEnd }
    : { start: defaultStart, end: defaultEnd };

  const [name, setName] = useState('');
  const [start, setStart] = useState(dateRange.start);
  const [endMode, setEndMode] = useState<'budget' | 'hires' | 'date'>('date');
  const [endBudget, setEndBudget] = useState(1000);
  const [endHires, setEndHires] = useState(10);
  const [endDate, setEndDate] = useState(dateRange.end);
  const [campaignStatus, setCampaignStatus] = useState<'active' | 'suspended' | 'draft'>('draft');

  // Populate form when a campaign is selected
  useEffect(() => {
    const selectedCampaign = campaigns.find(c => c.id === activeId);
    if (selectedCampaign) {
      setName(selectedCampaign.name);
      setStart(selectedCampaign.startDate);
      setEndMode(selectedCampaign.endMode);
      setEndBudget(selectedCampaign.endBudget || 1000);
      setEndHires(selectedCampaign.endHires || 10);
      setEndDate(selectedCampaign.endDate || dateRange.end);
      setCampaignStatus(selectedCampaign.status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const inputBase = "w-full bg-transparent outline-none text-sm py-1 px-2";

  const saveStart = (v: string) => { setStart(v); setDateRange((r) => ({ ...(r || {}), start: v })); };
  const saveEnd = (v: string) => { setEndDate(v); setEndMode('date'); setDateRange((r) => ({ ...(r || {}), end: v })); };

  const handleLaunchSuspend = () => {
    const newStatus: 'active' | 'suspended' = campaignStatus === 'active' ? 'suspended' : 'active';
    setCampaignStatus(newStatus);

    const existingCampaign = campaigns.find(c => c.id === activeId);

    if (existingCampaign) {
      setCampaigns(prev => prev.map(c =>
        c.id === activeId ? { ...c, status: newStatus } : c
      ));
    } else if (campaignStatus === 'draft' && name.trim()) {
      const newCampaign: Campaign = {
        id: `c${Date.now()}`,
        name: name.trim(),
        createdAt: new Date().toISOString().slice(0, 10),
        sources: DEFAULT_SOURCES,
        status: newStatus,
        locations: selectedLocations,
        jobs: selectedJobs,
        startDate: start,
        endDate: endMode === 'date' ? endDate : undefined,
        endBudget: endMode === 'budget' ? endBudget : undefined,
        endHires: endMode === 'hires' ? endHires : undefined,
        endMode: endMode,
      };
      setCampaigns(prev => [newCampaign, ...prev]);
      setActiveId(newCampaign.id);
    }
  };

  const handleSave = () => {
    setCampaigns(prev => prev.map(c =>
      c.id === activeId ? {
        ...c,
        name,
        startDate: start,
        endDate: endMode === 'date' ? endDate : undefined,
        endBudget: endMode === 'budget' ? endBudget : undefined,
        endHires: endMode === 'hires' ? endHires : undefined,
        endMode: endMode,
      } : c
    ));
  };

  const handleCopy = () => {
    const currentCampaign = campaigns.find(c => c.id === activeId);
    if (currentCampaign) {
      const copiedCampaign: Campaign = {
        ...currentCampaign,
        id: `c${Date.now()}`,
        name: `${currentCampaign.name} (Copy)`,
        status: 'draft',
        createdAt: new Date().toISOString().slice(0, 10),
      };
      setCampaigns(prev => [copiedCampaign, ...prev]);
      setActiveId(copiedCampaign.id);
    }
  };

  const handleDelete = () => {
    const currentCampaign = campaigns.find(c => c.id === activeId);
    if (currentCampaign && window.confirm(`Are you sure you want to delete "${currentCampaign.name}"?`)) {
      setCampaigns(prev => prev.filter(c => c.id !== activeId));
      const remaining = campaigns.filter(c => c.id !== activeId);
      if (remaining.length > 0) {
        setActiveId(remaining[0].id);
      }
    }
  };

  const handleNewCampaign = () => {
    setName('');
    setStart(dateRange.start);
    setEndMode('date');
    setEndBudget(1000);
    setEndHires(10);
    setEndDate(dateRange.end);
    setCampaignStatus('draft');
    setActiveId('');
  };

  return (
    <div className="mb-4 pb-4 border-b">
      {/* Compact Single Row Layout */}
      <div className="flex items-end gap-2 mb-3">
        {/* Campaign Name */}
        <div className="flex-1">
          <Field label="Campaign" active={true}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Campaign Name" className={inputBase} />
          </Field>
        </div>

        {/* Start Date */}
        <div className="w-40">
          <Field label="Start Date" active={true}>
            <input type="date" value={start} onChange={e => saveStart(e.target.value)} className={inputBase} />
          </Field>
        </div>

        {/* Campaign End Criterion with Radio Buttons */}
        <div className="flex items-end gap-2">
          {/* Budget */}
          <div className="flex items-end gap-1">
            <input
              aria-label="Budget radio"
              type="radio"
              name="end"
              checked={endMode === 'budget'}
              onChange={() => setEndMode('budget')}
              className="mb-2"
            />
            <div className={`w-32 ${endMode === 'budget' ? '' : 'opacity-50'}`}>
              <Field label="Budget" active={endMode === 'budget'}>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={endBudget}
                  onChange={e => setEndBudget(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                  className={inputBase}
                  disabled={endMode !== 'budget'}
                />
              </Field>
            </div>
          </div>

          {/* Hires */}
          <div className="flex items-end gap-1">
            <input
              aria-label="Hires radio"
              type="radio"
              name="end"
              checked={endMode === 'hires'}
              onChange={() => setEndMode('hires')}
              className="mb-2"
            />
            <div className={`w-24 ${endMode === 'hires' ? '' : 'opacity-50'}`}>
              <Field label="Hires" active={endMode === 'hires'}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={endHires}
                  onChange={e => setEndHires(Math.max(0, Math.floor(Number(e.target.value || 0))))}
                  className={inputBase}
                  disabled={endMode !== 'hires'}
                />
              </Field>
            </div>
          </div>

          {/* End Date */}
          <div className="flex items-end gap-1">
            <input
              aria-label="End date radio"
              type="radio"
              name="end"
              checked={endMode === 'date'}
              onChange={() => setEndMode('date')}
              className="mb-2"
            />
            <div className={`w-40 ${endMode === 'date' ? '' : 'opacity-50'}`}>
              <Field label="End Date" active={endMode === 'date'}>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => saveEnd(e.target.value)}
                  className={inputBase}
                  disabled={endMode !== 'date'}
                />
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div className="flex gap-2">
        <button
          onClick={handleNewCampaign}
          className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-purple-600 hover:bg-purple-700 text-white"
        >
          New Campaign
        </button>
        {campaignStatus !== 'active' ? (
          <button
            onClick={handleLaunchSuspend}
            className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-green-600 hover:bg-green-700 text-white"
          >
            Launch
          </button>
        ) : (
          <button
            onClick={handleLaunchSuspend}
            className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-orange-600 hover:bg-orange-700 text-white"
          >
            Suspend
          </button>
        )}
        <button
          onClick={handleSave}
          className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-blue-600 hover:bg-blue-700 text-white"
        >
          Save
        </button>
        <button
          onClick={handleCopy}
          className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-gray-600 hover:bg-gray-700 text-white"
        >
          Copy
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-1.5 rounded-lg font-medium text-sm transition bg-red-600 hover:bg-red-700 text-white"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ===============================
// CampaignsWindow – flattened fields, robust date defaults
// ===============================
interface CampaignsWindowProps {
  campaigns: Campaign[];
  activeId: string;
  setActiveId: (id: string) => void;
  setCampaigns: React.Dispatch<React.SetStateAction<Campaign[]>>;
  onSelectCampaign: (campaign: Campaign) => void;
  selectedLocations: string[];
  selectedJobs: string[];
}

function CampaignsWindow(props: CampaignsWindowProps){
  const {
    campaigns = [],
    activeId,
    onSelectCampaign,
    setCampaigns,
    setActiveId,
  } = props || {};

  const [statusFilter, setStatusFilter] = useState<'all'|'active'|'suspended'|'draft'>('all');
  const [query] = useState(''); // search removed per request
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'job'|'campaign'|null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Job colors for avatar circle
  const JOB_COLORS: Record<string, string> = {
    "Server": "#D72A4D",
    "Cook": "#FB8331",
    "Bartender": "#FFCB03",
    "Security": "#21BF6B",
    "Dishwasher": "#12B9B1",
    "Manager": "#2E98DB",
    "Cleaner": "#3967D6",
    "Barista": "#8855D0"
  };

  const allLocations = useMemo(()=> {
    const set = new Set<string>();
    (campaigns||[]).forEach(c => (c.locations||[]).forEach(loc => set.add(loc)));
    return ['all', ...Array.from(set).sort()];
  }, [campaigns]);
  const allJobs = useMemo(()=> {
    const set = new Set<string>();
    (campaigns||[]).forEach(c => (c.jobs||[]).forEach(j => set.add(j)));
    return ['all', ...Array.from(set).sort()];
  }, [campaigns]);

  const previewRows = useMemo(()=>{
    const q = query.trim().toLowerCase();
    const statusOrder: Record<string, number> = { active: 0, launched: 1, suspended: 2, completed: 3 };
    let rows = (campaigns || [])
      .filter(c => statusFilter === 'all' ? true : c.status === statusFilter)
      .filter(c => locationFilter === 'all' ? true : (c.locations||[]).includes(locationFilter))
      .filter(c => jobFilter === 'all' ? true : (c.jobs||[]).includes(jobFilter))
      .filter(c => q ? (c.name || '').toLowerCase().includes(q) : true)
      .map((c)=>{
        const hiresTotal = typeof c.endHires === 'number' ? c.endHires : null;
        // Show the campaign's own job only; if none, leave neutral (gray)
        const job = (c.jobs && c.jobs.length > 0) ? c.jobs[0] : '';
        const jobInitial = job ? job.charAt(0).toUpperCase() : '';
        const jobColor = JOB_COLORS[job] || '#64748B';
        // Normalize status to desired set
        const status = (c.status === 'draft') ? ('launched' as const) : (c.status as any);
        return { id:c.id || '', name:c.name || 'Untitled Campaign', hiresTotal, status, job, jobInitial, jobColor, statusRank: statusOrder[status] ?? 99 };
      });
    if (sortField) {
      rows.sort((a,b)=>{
        if (sortField === 'job') {
          const A = (a.job||'').toLowerCase(); const B = (b.job||'').toLowerCase();
          return sortAsc ? A.localeCompare(B) : B.localeCompare(A);
        } else if (sortField === 'campaign') {
          const A = (a.name||'').toLowerCase(); const B = (b.name||'').toLowerCase();
          return sortAsc ? A.localeCompare(B) : B.localeCompare(A);
        } else {
          const diff = (a.statusRank - b.statusRank);
          return sortAsc ? diff : -diff;
        }
      });
    }
    return rows;
  },[campaigns, statusFilter, query, locationFilter, jobFilter, sortField, sortAsc, props.selectedJobs]);

  const handleCreateCampaign = () => {
    const id = `c${Date.now()}`;
    const newC: Campaign = {
      id,
      name: 'New Campaign',
      createdAt: safeISO(new Date()),
      sources: [],
      status: 'suspended',
      locations: [],
      jobs: [],
      startDate: safeISO(new Date()),
      endMode: 'date',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setCampaigns as any)?.((prev: Campaign[]) => [newC, ...(prev || [])]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (setActiveId as any)?.(id);
  };

  return (
    <div className="bg-white border rounded-xl p-3">
      {/* Title with sort icon */}
      <div className="flex items-center justify-between mb-3 relative">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold">Campaigns</div>
          <button
            type="button"
            className="w-5 h-5 inline-flex items-center justify-center rounded-full border text-gray-700 hover:bg-gray-50"
            title="New Campaign"
            aria-label="New Campaign"
            onClick={handleCreateCampaign}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="p-1.5 rounded hover:bg-gray-100"
          title="Sort"
          onClick={()=> setShowSortMenu(v=>!v)}
        >
          {/* Separate up and down arrows (larger) */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Up arrow (left) */}
            <path d="M8 17V7" />
            <path d="M8 7 L6 9" />
            <path d="M8 7 L10 9" />
            {/* Down arrow (right) */}
            <path d="M16 7V17" />
            <path d="M16 17 L14 15" />
            <path d="M16 17 L18 15" />
          </svg>
        </button>
        {showSortMenu && (
          <div className="absolute right-0 top-7 w-56 bg-white border rounded shadow p-2 z-10">
            <div className="text-xs text-gray-500 px-1 pb-1">Sort by</div>
            <div className="divide-y">
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('campaign'); setSortAsc(true); setShowSortMenu(false); }}>Campaign (A → Z)</button>
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('campaign'); setSortAsc(false); setShowSortMenu(false); }}>Campaign (Z → A)</button>
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('job'); setSortAsc(true); setShowSortMenu(false); }}>Job (A → Z)</button>
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('job'); setSortAsc(false); setShowSortMenu(false); }}>Job (Z → A)</button>
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('status'); setSortAsc(true); setShowSortMenu(false); }}>Status (Active → …)</button>
              <button className="w-full text-left px-2 py-2 text-sm hover:bg-gray-50" onClick={()=>{ setSortField('status'); setSortAsc(false); setShowSortMenu(false); }}>Status (… → Active)</button>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar removed per request */}
      
      {/* Scrollable Campaign List */}
      <div className="border rounded-lg h-[calc(100vh-240px)] overflow-y-scroll pr-2">
        <div className="divide-y">
          {previewRows.length === 0 && (
            <div className="p-6 text-sm text-gray-500">
              <div className="font-medium text-gray-700 mb-1">No campaigns match your filters.</div>
              <div>Try clearing the search or choosing “All” for status, location, or job.</div>
            </div>
          )}
          {previewRows.map(row=> {
            const campaign = campaigns.find(c => c.id === row.id);
            const statusBg =
              row.status === 'active' ? 'bg-green-50' :
              row.status === 'suspended' ? 'bg-red-50' :
              row.status === 'completed' ? 'bg-gray-100' :
              row.status === 'launched' ? 'bg-blue-50' : 'bg-white';
            return (
              <button
                key={row.id}
                onClick={()=> { if (campaign) onSelectCampaign(campaign); }}
                className={`w-full grid grid-cols-12 items-center px-3 py-2 text-sm text-left transition ${statusBg} ${row.id===activeId ? 'ring-1 ring-blue-400' : 'hover:opacity-90'}`}
              >
                <div className="col-span-3 flex items-center gap-2 truncate">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold" style={{ background: row.jobColor, color: '#fff' }}>
                    {row.jobInitial}
                  </span>
                </div>
                <div className="col-span-9 truncate -ml-[25px]">{row.name}</div>
              </button>
            );
          })}
        </div>
      </div>
      {/* Footer controls removed per request */}
    </div>
  );
}

// ===============================
// AreaSection – stacked smooth areas with points
// ===============================
interface AreaSectionProps {
  series: any[];
  sources: Source[];
  showPoints?: boolean;
}

function AreaSection({ series, sources, showPoints }: AreaSectionProps){
  const enabled = (sources || []).filter(s=> s.enabled && s.cpa>0 && s.dailyBudget>0);
  if (enabled.length===0) return <div className="text-sm text-gray-500">Enable at least one paid source to visualize.</div>;

  const days = series.length;
  const W = 840, H = 270, PADL = 52, PADB = 50, PADT = 22, PADR = 12;
  const innerW = W-PADL-PADR, innerH = H-PADT-PADB;

  const stack = series.map(d=>{
    let acc=0; const layers: any[]=[];
    enabled.forEach(s=>{ const v=Number(d.bySource[s.key]||0); const y0=acc; acc+=Math.max(0,v); layers.push({key:s.key,y0,y1:acc}); });
    return { total: acc, layers, label: d.weekday, date: d.date };
  });
  const maxY = Math.max(1, ...stack.map(r=> r.total));
  const X = (i: number)=> PADL + (i/(Math.max(1,days-1)))*innerW;
  const Y = (v: number)=> PADT + innerH - (v/maxY)*innerH;

  const smooth = (pts: {x: number; y: number}[])=>{
    if(pts.length<2) return '';
    let d = `M ${pts[0].x},${pts[0].y}`;
    for(let i=0;i<pts.length-1;i++){
      const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
      const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
      const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
      d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const buildAreaPath = (upper: {x: number; y: number}[], lower: {x: number; y: number}[])=>{
    if(!upper.length || !lower.length) return '';
    let d = smooth(upper);
    d += ` L ${lower[0].x},${lower[0].y}`;
    if(lower.length>1){
      for(let i=0;i<lower.length-1;i++){
        const p0=lower[i-1]||lower[i], p1=lower[i], p2=lower[i+1], p3=lower[i+2]||p2;
        const c1x=p1.x+(p2.x-p0.x)/6, c1y=p1.y+(p2.y-p0.y)/6;
        const c2x=p2.x-(p3.x-p1.x)/6, c2y=p2.y-(p3.y-p1.y)/6;
        d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
      }
    }
    d += ' Z';
    return d;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[270px]">
      {[0,0.25,0.5,0.75,1].map((t,i)=>{
        const y = PADT + innerH - t*innerH;
        return <line key={i} x1={PADL} y1={y} x2={W-PADR} y2={y} stroke="#e5e7eb" strokeDasharray="3 3"/>;
      })}
      <line x1={PADL} y1={PADT} x2={PADL} y2={H-PADB} stroke="#cbd5e1"/>
      <line x1={PADL} y1={H-PADB} x2={W-PADR} y2={H-PADB} stroke="#cbd5e1"/>

      {enabled.map((s,si)=>{
        const upper = stack.map((r,i)=>({x:X(i), y:Y(r.layers[si].y1)}));
        const lower = stack.map((r,i)=>({x:X(i), y:Y(r.layers[si].y0)})).reverse();
        const d = buildAreaPath(upper, lower);
        return <path key={s.key} d={d} fill={SOURCE_COLORS[s.key]} opacity={0.65} stroke="#000" strokeWidth={0.5}/>;
      })}

      {showPoints !== false && enabled.map((s,si)=> stack.map((r,i)=>{
        const uy = Y(r.layers[si].y1), ly = Y(r.layers[si].y0), x=X(i);
        return (
          <g key={`${s.key}-${i}`}>
            <circle cx={x} cy={uy} r={1.5} fill="#111" />
            <circle cx={x} cy={ly} r={1.5} fill="#666" />
          </g>
        );
      }))}

      {stack.map((r,i)=>{
        const x=X(i);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={H-PADB} y2={H-PADB+4} stroke="#94a3b8"/>
            <text x={x} y={H-PADB+16} fontSize="10" textAnchor="middle" fill="#475569">{r.label}</text>
            <text x={x} y={H-PADB+28} fontSize="10" textAnchor="middle" fill="#94a3b8">{r.date}</text>
          </g>
        );
      })}

      {[0,0.25,0.5,0.75,1].map((t,i)=>{
        const v=Math.round(t* Math.max(1,...stack.map(r=>r.total))); const y=PADT+innerH-t*innerH;
        return <text key={i} x={PADL-6} y={y+3} fontSize="10" textAnchor="end" fill="#475569">{v}</text>;
      })}
    </svg>
  );
}

// Minimal hires vs target line chart
function HiresVsTargetChart({ hiresPerDay, targetPerDay }: { hiresPerDay: number; targetPerDay: number }) {
  const days = 28;
  const seriesActual = Array.from({ length: days }, () => Math.max(0, hiresPerDay));
  const seriesTarget = Array.from({ length: days }, () => Math.max(0, targetPerDay));
  const maxY = Math.max(1, ...seriesActual, ...seriesTarget);
  const W = 820, H = 160, PADL = 36, PADR = 8, PADT = 10, PADB = 22;
  const innerW = W - PADL - PADR, innerH = H - PADT - PADB;
  const X = (i: number) => PADL + (i / Math.max(1, days - 1)) * innerW;
  const Y = (v: number) => PADT + innerH - (v / maxY) * innerH;
  const pathFor = (arr: number[], color: string, dash = false) => {
    let d = '';
    arr.forEach((v, i) => {
      const x = X(i), y = Y(v);
      d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    });
    return <path d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dash ? '4 3' : undefined} />;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36">
      {[0, 0.5, 1].map((t, i) => {
        const y = PADT + innerH - t * innerH;
        return <line key={i} x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="#e5e7eb" />;
      })}
      {pathFor(seriesTarget, '#6b7280', true)}
      {pathFor(seriesActual, '#16a34a')}
      {/* Y axis ticks */}
      {[0, 0.5, 1].map((t, i) => {
        const y = PADT + innerH - t * innerH;
        const v = Math.round(t * maxY);
        return <text key={i} x={PADL - 6} y={y + 3} fontSize="10" textAnchor="end" fill="#475569">{v}</text>;
      })}
      {/* X axis ticks: start/mid/end */}
      {[0, Math.floor(days/2), days-1].map((i, idx) => {
        const x = X(i);
        return <line key={idx} x1={x} y1={H - PADB} x2={x} y2={H - PADB + 4} stroke="#94a3b8" />;
      })}
    </svg>
  );
}

// Source mix mini visualization using shared planner state
function SourceMixMini() {
  const _ver = useCampaignPlanVersion();
  const s = getStateSnapshot();
  const planner = s.planner;
  const dailyLimit = Math.max(0, Number(planner.dailySpend || 0));
  const overallConv = Math.max(0, Math.min(1, Number(s.conversionRate) || 0));
  const sources = (s.sources || []).filter(src => src.active);

  if (sources.length === 0) {
    return <div className="text-sm text-gray-500"><em>Enable at least one source to see allocation.</em></div>;
  }

  // Helpers aligned with campaignPlan allocator
  const APPLY_CPC = 0.12;
  const APPLY_DAILY = 0.10;
  const CTR = 0.015;
  const effectiveCPA = (src: SourceSnapshot): number => {
    switch (src.spend_model) {
      case 'cpa': return Math.max(0.0001, Number(src.cpa_bid || 10));
      case 'cpc': return Math.max(0.0001, Number(src.cpc || 2)) / APPLY_CPC;
      case 'cpm': return Math.max(0.0001, Number(src.cpm || 10)) / (1000 * CTR * APPLY_DAILY);
      case 'daily_budget': return Math.max(0.0001, Number((src as any).cpa_bid || 10));
      case 'referral': return Math.max(0.0001, Number(src.referral_bonus_per_hire || 0)) * Math.max(0.0001, overallConv);
      default: return Number.POSITIVE_INFINITY;
    }
  };

  // Allocate spend per the greedy rules
  let remaining = dailyLimit;
  const spendAlloc = new Map<string, number>();

  // 1) Threshold daily_budget sources
  const threshold = sources
    .filter((src) => src.spend_model === 'daily_budget' && (src.daily_budget || 0) > 0 && ((src as any).cpa_bid || 0) > 0)
    .sort((a, b) => effectiveCPA(a) - effectiveCPA(b));
  for (const src of threshold) {
    const need = Math.max(0, Number(src.daily_budget || 0));
    if (remaining >= need) {
      spendAlloc.set(src.id, need);
      remaining -= need;
    } else {
      spendAlloc.set(src.id, 0);
    }
  }

  // 2) Scalable sources by cheapest CPA first
  const scalable = sources
    .filter((src) => src.spend_model === 'referral' || src.spend_model === 'cpc' || src.spend_model === 'cpm' || src.spend_model === 'cpa')
    .sort((a, b) => effectiveCPA(a) - effectiveCPA(b));
  for (const src of scalable) {
    if (remaining <= 0) break;
    const cap = src.spend_model === 'referral'
      ? Math.max(0, Number(src.referral_bonus_per_hire || 0)) * Math.max(0, Number(src.apps_override || 0)) * Math.max(0.0001, overallConv)
      : (Number.isFinite(Number(src.daily_budget)) ? Math.max(0, Number(src.daily_budget)) : Number.POSITIVE_INFINITY);
    const take = Math.min(remaining, cap);
    if (take > 0) {
      spendAlloc.set(src.id, (spendAlloc.get(src.id) || 0) + take);
      remaining -= take;
    }
  }

  // Build rows: include organic (spend 0, apps from override)
  type Row = { id: string; name: string; color: string; spend: number; apps: number; cpa: number; };
  const rows: Row[] = [];
  for (const src of sources) {
    const color = (src.color as string) || '#64748b';
    const spend = spendAlloc.get(src.id) || 0;
    let apps = 0;
    let cpaEff = effectiveCPA(src);
    if (src.spend_model === 'organic') {
      apps = Math.max(0, Math.round(Number(src.apps_override || 0)));
      cpaEff = 0;
    } else if (src.spend_model === 'daily_budget') {
      const need = Math.max(0, Number(src.daily_budget || 0));
      const bid = Math.max(0.0001, Number((src as any).cpa_bid || 10));
      apps = spend >= need ? Math.round(spend / bid) : 0;
    } else if (src.spend_model === 'referral') {
      const bounty = Math.max(0.0001, Number(src.referral_bonus_per_hire || 0));
      const conv = Math.max(0.0001, overallConv);
      const maxApps = Math.max(0, Number(src.apps_override || 0));
      const appsFromSpend = spend > 0 ? spend / (bounty * conv) : 0;
      apps = Math.round(Math.min(maxApps, appsFromSpend));
    } else if (src.spend_model === 'cpa') {
      const bid = Math.max(0.0001, Number(src.cpa_bid || 10));
      apps = Math.round(spend / bid);
    } else if (src.spend_model === 'cpc') {
      const cpc = Math.max(0.0001, Number(src.cpc || 2));
      const clicks = spend / cpc;
      apps = Math.round(clicks * APPLY_CPC);
    } else if (src.spend_model === 'cpm') {
      const cpm = Math.max(0.0001, Number(src.cpm || 10));
      const impressions = (spend / cpm) * 1000;
      const clicks = impressions * CTR;
      apps = Math.round(clicks * APPLY_DAILY);
    }
    rows.push({ id: src.id, name: src.name || src.id, color, spend, apps, cpa: cpaEff });
  }

  const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
  if (totalSpend <= 0 && rows.every(r => r.apps <= 0)) {
    return <div className="text-sm text-gray-500"><em>No allocatable spend. Increase Daily Spend or enable sources.</em></div>;
  }

  // Sort by spend desc, then apps desc
  rows.sort((a, b) => (b.spend - a.spend) || (b.apps - a.apps));

  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>Source mix</span>
        <span>Daily Spend: ${Math.round(dailyLimit).toLocaleString()}</span>
      </div>
      <div className="space-y-2">
        {rows.map(r => {
          const pct = totalSpend > 0 ? (r.spend / totalSpend) : 0;
          return (
            <div key={r.id}>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }}></span>
                  <span className="text-gray-700">{r.name}</span>
                </div>
                <div className="text-gray-600">
                  {r.apps > 0 ? <span className="mr-3">{r.apps} apps/day</span> : <span className="mr-3 text-gray-400">0 apps/day</span>}
                  {r.spend > 0 ? <span>${Math.round(r.spend).toLocaleString()}/day</span> : <span className="text-gray-400">$0/day</span>}
                </div>
              </div>
              <div className="h-2 bg-gray-200 rounded overflow-hidden mt-1">
                <div className="h-full" style={{ width: `${Math.max(2, Math.round(pct * 100))}%`, background: r.color, opacity: 0.8 }}></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Related campaigns multi-select dropdown
function RelatedCampaignsSelector({
  campaigns,
  currentId,
  relatedIds,
  onChange,
}: {
  campaigns: Campaign[];
  currentId: string;
  relatedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = campaigns.filter(c => c.id !== currentId);
  const toggle = (id: string) => {
    const set = new Set(relatedIds || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange(Array.from(set));
  };
  const label = relatedIds.length === 0
    ? 'Link related campaigns'
    : `${relatedIds.length} linked`;
  return (
    <div className="relative">
      <div className="text-[11px] text-gray-500 mb-1">Related Campaigns</div>
      <button
        type="button"
        onClick={()=> setOpen(!open)}
        className="w-full text-left text-sm border rounded px-2 py-1 hover:bg-gray-50"
      >
        {label}
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow">
          <div className="max-h-48 overflow-auto py-1">
            {options.map(opt=>(
              <label key={opt.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 text-sm">
                <input
                  type="checkbox"
                  checked={relatedIds.includes(opt.id)}
                  onChange={()=> toggle(opt.id)}
                />
                <span className="truncate">{opt.name}</span>
                <span className="ml-auto text-xs text-gray-500">{opt.status}</span>
              </label>
            ))}
            {options.length===0 && (
              <div className="px-2 py-2 text-xs text-gray-500">No other campaigns.</div>
            )}
          </div>
        </div>
      )}
      {relatedIds.length>0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {relatedIds.map(id=>{
            const c = campaigns.find(x=> x.id===id);
            if (!c) return null;
            return (
              <span key={id} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs border">
                {c.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

