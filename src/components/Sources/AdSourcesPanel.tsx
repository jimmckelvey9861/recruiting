import { useMemo, useState, ChangeEvent, useEffect } from "react";
import { setSourcesSnapshot } from '../../state/campaignPlan';
import { getStateSnapshot } from '../../state/campaignPlan';

type SpendModel =
  | "organic"
  | "daily_budget"
  | "cpc"
  | "cpm"
  | "cpa"
  | "referral";

type SourceType =
  | "Word of Mouth / Community"
  | "Employee Referrals"
  | "Job Board / Aggregator"
  | "Programmatic Ads / Display"
  | "Social"
  | "Events / Walk-ins";

type Schedule = { start: string | null };

type EndCriterionType = "date" | "hires" | "budget";

type AdSource = {
  id: string;
  name: string;
  type: SourceType;
  color: string;
  active: boolean;
  spend_model: SpendModel;
  daily_budget?: number | null;
  cpc?: number | null;
  cpm?: number | null;
  cpa_bid?: number | null;
  referral_bonus_per_hire?: number | null;
  organic_per_day?: number | null;
  apps_override?: number | null;
  quality_percent?: number | null;
  daily_cap_apps?: number | null;
  schedule?: Schedule;
  end_type?: EndCriterionType;
  end_date?: string | null;
  end_hires?: number | null;
  end_budget?: number | null;
  // Funnel metrics (percent values 0..100)
  funnel_app_to_interview?: number | null;
  funnel_interview_to_offer?: number | null;
  funnel_offer_to_background?: number | null;
  funnel_background_to_hire?: number | null;
};

const nonNeg = (n: unknown, def = 0) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : def);
const money0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
// Summary display: show cents only for amounts under $3; otherwise round to nearest dollar
const moneySummary = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n as number)) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 3) return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(2)}`;
};
const int0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : Number(n).toLocaleString();
const todayISO = () => new Date().toISOString().slice(0, 10);

function deriveKpis(source: AdSource) {
  const cap = nonNeg(source.daily_cap_apps ?? 0);
  let spendDay: number | null = null;
  let apps = 0;

  // Assumptions aligning with Review/allocator logic
  const APPLY_CPC = 0.12; // CPC apply rate
  const APPLY_DAILY = 0.10; // Daily_Budget apply rate
  const CTR = 0.015; // CPM click-through

  switch (source.spend_model) {
    case "organic": {
      const monthly = nonNeg(source.daily_budget ?? 0); // reuse daily_budget as monthly storage for organic
      spendDay = monthly / 30;
      const overrideApps = nonNeg(source.apps_override ?? source.organic_per_day ?? 0);
      apps = overrideApps;
      break;
    }
    case "daily_budget": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const impliedCpc = Math.max(0.0001, nonNeg(source.cpc ?? 2));
      const effCPA = impliedCpc / APPLY_DAILY;
      if (source.apps_override != null) {
        const desiredApps = Math.max(0, Number(source.apps_override));
        const desiredSpend = desiredApps * effCPA;
        spendDay = Math.min(budget, desiredSpend);
        apps = desiredApps;
      } else {
        const clicks = budget / impliedCpc;
        const applyRate = APPLY_DAILY;
        apps = clicks * applyRate;
        spendDay = budget;
      }
      break;
    }
    case "cpc": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const cpc = Math.max(0.0001, nonNeg(source.cpc ?? 2));
      const effCPA = cpc / APPLY_CPC;
      if (source.apps_override != null) {
        const desiredApps = Math.max(0, Number(source.apps_override));
        const desiredSpend = desiredApps * effCPA;
        spendDay = Math.min(budget, desiredSpend);
        apps = desiredApps;
      } else {
        const clicks = budget / cpc;
        const applyRate = APPLY_CPC;
        apps = clicks * applyRate;
        spendDay = budget;
      }
      break;
    }
    case "cpm": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const cpm = Math.max(0.0001, nonNeg(source.cpm ?? 10));
      const effCPA = cpm / (1000 * CTR * APPLY_DAILY);
      if (source.apps_override != null) {
        const desiredApps = Math.max(0, Number(source.apps_override));
        const desiredSpend = desiredApps * effCPA;
        spendDay = Math.min(budget, desiredSpend);
        apps = desiredApps;
      } else {
        const impressions = (budget / cpm) * 1000;
        const clicks = impressions * CTR;
        const applyRate = APPLY_DAILY;
        apps = clicks * applyRate;
        spendDay = budget;
      }
      break;
    }
    case "cpa": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const bid = Math.max(0.0001, nonNeg(source.cpa_bid ?? 10));
      if (source.apps_override != null) {
        const desiredApps = Math.max(0, Number(source.apps_override));
        const desiredSpend = desiredApps * bid;
        spendDay = Math.min(budget, desiredSpend);
        apps = desiredApps;
      } else {
        apps = budget / bid;
        spendDay = budget;
      }
      break;
    }
    case "referral": {
      // Display-only: spend comes from Editor (bounty * hires/day) elsewhere; keep null here.
      spendDay = null;
      apps = nonNeg(source.apps_override ?? source.organic_per_day ?? 0);
      break;
    }
    default:
      break;
  }

  if (cap > 0) apps = Math.min(apps, cap);
  const cpa = spendDay == null || apps <= 0 ? null : spendDay / apps;
  return { apps, spendDay, cpa };
}

function seed(): AdSource[] {
  return [
    {
      id: "src_indeed_001",
      name: "Indeed Sponsored",
      type: "Job Board / Aggregator",
      color: "#2563eb",
      active: true,
      spend_model: "cpc",
      daily_budget: 350,
      cpc: 1.8,
      daily_cap_apps: 0,
      schedule: { start: todayISO() },
      end_type: "budget",
      end_budget: 12000,
      end_hires: null,
      end_date: null,
      apps_override: null,
      quality_percent: 78,
      funnel_app_to_interview: 5,
      funnel_interview_to_offer: 40,
      funnel_offer_to_background: 90,
      funnel_background_to_hire: 90,
    },
    {
      id: "src_fb_001",
      name: "Facebook Ads",
      type: "Social",
      color: "#4f46e5",
      active: true,
      spend_model: "cpm",
      daily_budget: 200,
      cpm: 9,
      daily_cap_apps: 0,
      schedule: { start: todayISO() },
      end_type: "date",
      end_date: todayISO(),
      end_budget: null,
      end_hires: null,
      apps_override: null,
      quality_percent: 74,
      funnel_app_to_interview: 5,
      funnel_interview_to_offer: 40,
      funnel_offer_to_background: 90,
      funnel_background_to_hire: 90,
    },
    {
      id: "src_ref_001",
      name: "Employee Referrals",
      type: "Employee Referrals",
      color: "#10b981",
      active: true,
      spend_model: "referral",
      referral_bonus_per_hire: 300,
      daily_cap_apps: 0,
      schedule: { start: todayISO() },
      end_type: "hires",
      end_hires: 20,
      end_budget: null,
      end_date: null,
      organic_per_day: 1.5,
      apps_override: 5,
      quality_percent: 88,
      funnel_app_to_interview: 5,
      funnel_interview_to_offer: 40,
      funnel_offer_to_background: 90,
      funnel_background_to_hire: 90,
    },
    {
      id: "src_org_001",
      name: "Word of Mouth",
      type: "Word of Mouth / Community",
      color: "#334155",
      active: false,
      spend_model: "organic",
      organic_per_day: 2.5,
      daily_cap_apps: 0,
      schedule: { start: todayISO() },
      end_type: "date",
      end_date: todayISO(),
      end_budget: null,
      end_hires: null,
      apps_override: 3,
      quality_percent: 82,
      funnel_app_to_interview: 5,
      funnel_interview_to_offer: 40,
      funnel_offer_to_background: 90,
      funnel_background_to_hire: 90,
    },
  ];
}

export default function AdSourcesPanel() {
  const [sources, setSources] = useState<AdSource[]>(seed());
  const [activeId, setActiveId] = useState<string>(sources[0]?.id || "");
  const active = useMemo(() => sources.find((source) => source.id === activeId) || null, [sources, activeId]);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted sources on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('passcom-sources-v1');
      const aid = localStorage.getItem('passcom-sources-active');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setSources(parsed);
          setActiveId(aid || parsed[0]?.id || "");
        }
      }
    } catch {}
    setHydrated(true);
  }, []);

  const update = (id: string, patch: Partial<AdSource>) =>
    setSources((prev) => prev.map((source) => (source.id === id ? { ...source, ...patch } : source)));

  const replace = (id: string, nextSource: AdSource) =>
    setSources((prev) => prev.map((source) => (source.id === id ? nextSource : source)));

  const addNew = () => {
    const nid = `src_${Math.random().toString(36).slice(2, 7)}`;
    const fresh: AdSource = {
      id: nid,
      name: "New Source",
      type: "Job Board / Aggregator",
      color: "#0ea5e9",
      active: true,
      spend_model: "daily_budget",
      daily_budget: 100,
      cpc: 2,
      daily_cap_apps: 0,
      schedule: { start: todayISO() },
      end_type: "date",
      end_date: todayISO(),
      end_budget: null,
      end_hires: null,
    };
    setSources((prev) => [fresh, ...prev]);
    setActiveId(nid);
  };

  const remove = (id: string) => {
    setSources((prev) => {
      const filtered = prev.filter((source) => source.id !== id);
      if (activeId === id) {
        setActiveId(filtered[0]?.id || "");
      }
      return filtered;
    });
  };

  // Build snapshot for planner consumers
  const snapshot = useMemo(() => sources.map(s => ({
    id: s.id,
    name: s.name,
    active: s.active,
    spend_model: s.spend_model,
    color: s.color,
    cpa_bid: s.cpa_bid,
    cpc: s.cpc,
    cpm: s.cpm,
    daily_budget: s.daily_budget,
    referral_bonus_per_hire: s.referral_bonus_per_hire,
    apps_override: s.apps_override ?? null,
    funnel_app_to_interview: s.funnel_app_to_interview ?? null,
    funnel_interview_to_offer: s.funnel_interview_to_offer ?? null,
    funnel_offer_to_background: s.funnel_offer_to_background ?? null,
    funnel_background_to_hire: s.funnel_background_to_hire ?? null,
  })), [sources]);
  // Publish snapshot and persist to localStorage on change
  useEffect(() => {
    setSourcesSnapshot(snapshot);
    if (!hydrated) return;
    try {
      localStorage.setItem('passcom-sources-v1', JSON.stringify(sources));
      localStorage.setItem('passcom-sources-active', activeId);
    } catch {}
  }, [snapshot, sources, activeId, hydrated]);

  return (
    <div className="w-full min-h-[560px] bg-white border rounded-xl p-4 grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-5">
        <div className="flex items-center justify-between mb-2">
          <button className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50" onClick={addNew}>
            New Source
          </button>
        </div>

        <div className="border rounded-md divide-y max-h-[520px] overflow-y-auto">
          {sources.map((source) => {
            const kpis = deriveKpis(source);
            const appsValue = source.apps_override != null ? source.apps_override : kpis.apps;
            const conv = (getStateSnapshot().conversionRate as number) || 0;
            const hiresPerDayFromConv = appsValue * conv;
            const referralSpend =
              source.spend_model === "referral" && source.referral_bonus_per_hire != null
                ? source.referral_bonus_per_hire * hiresPerDayFromConv
                : null;
            const spendUsed = referralSpend != null ? referralSpend : kpis.spendDay;
            const cpaValue = appsValue > 0 ? (spendUsed != null ? spendUsed / appsValue : null) : null;
            return (
              <div
                key={source.id}
                className={`px-3 py-2 flex items-center justify-between gap-3 ${
                  source.id === activeId ? "bg-gray-50" : ""
                }`}
              >
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => setActiveId(source.id)}
                  title="Select"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: source.color }} />
                    <div className="font-medium truncate">{source.name}</div>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded ${
                        source.active ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {source.active ? "Active" : "Paused"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-600 flex items-center gap-4">
                    <span>
                      Apps/day: <b>{int0(Math.round(appsValue))}</b>
                    </span>
                    <span>
                      CPA: <b>{moneySummary(cpaValue as any)}</b>
                    </span>
                    {(() => {
                      const r1 = (Number(source.funnel_app_to_interview ?? 5) / 100);
                      const r2 = (Number(source.funnel_interview_to_offer ?? 40) / 100);
                      const r3 = (Number(source.funnel_offer_to_background ?? 90) / 100);
                      const r4 = (Number(source.funnel_background_to_hire ?? 90) / 100);
                      const total = Math.max(0, r1 * r2 * r3 * r4);
                      const cph = total > 0 && cpaValue != null ? (cpaValue as number) / total : null;
                      return (
                        <span>
                          CPH: <b>{moneySummary(cph as any)}</b>
                        </span>
                      );
                    })()}
                    <span>
                      Spend/day: <b>{moneySummary(spendUsed as any)}</b>
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="text-xs px-2 py-1 border rounded"
                    onClick={() => update(source.id, { active: !source.active })}
                  >
                    {source.active ? "Pause" : "Resume"}
                  </button>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4 text-red-600 cursor-pointer hover:text-red-700"
                    onClick={() => remove(source.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        remove(source.id);
                      }
                    }}
                    title="Delete source"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.75 3a1.25 1.25 0 00-1.2.93l-.112.447H5a.75.75 0 000 1.5h.278l.606 8.49A2.25 2.25 0 008.129 16h3.742a2.25 2.25 0 002.245-2.133l.606-8.49H15a.75.75 0 000-1.5h-2.438l-.112-.447A1.25 1.25 0 0011.25 3h-2.5zm-1 3.75a.75.75 0 00-1.5.06l.3 6a.75.75 0 001.5-.06l-.3-6zm3.5-.75a.75.75 0 00-.75.75v6a.75.75 0 001.5 0v-6a.75.75 0 00-.75-.75z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="col-span-12 lg:col-span-7">
        {active ? (
          <Editor source={active} onChange={(nextSource) => replace(active.id, nextSource)} />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500 border rounded-md">
            Select or create a source
          </div>
        )}
      </div>
    </div>
  );
}

function FieldBox({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative bg-white border border-gray-200 rounded-lg px-3 pt-2 pb-2 ${className}`}>
      <div className="absolute -top-2 left-2 bg-white px-1 text-[11px] text-gray-500">{label}</div>
      {children}
    </div>
  );
}

function Editor({ source, onChange }: { source: AdSource; onChange: (source: AdSource) => void }) {
  const s = source;
  const set = (patch: Partial<AdSource>) => onChange({ ...s, ...patch });
  const setNum = (key: keyof AdSource) => (event: ChangeEvent<HTMLInputElement>) =>
    set({ [key]: event.target.value === "" ? null : Number(event.target.value) } as Partial<AdSource>);

  const kpis = deriveKpis(s);
  const appsValue = s.apps_override != null ? s.apps_override : kpis.apps;
  const qualityValue = s.quality_percent != null ? s.quality_percent : 75;
  const conversion = getStateSnapshot().conversionRate || 0;
  const hiresPerDayKpi = appsValue * conversion;
  const referralSpend =
    s.spend_model === "referral" && s.referral_bonus_per_hire != null
      ? s.referral_bonus_per_hire * hiresPerDayKpi
      : null;
  const spendUsed = referralSpend != null ? referralSpend : kpis.spendDay;
  const cpaValue = appsValue > 0 ? (spendUsed != null ? spendUsed / appsValue : null) : null;
  const input = "w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm";
  const pctInput = "w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm text-right";
  const clampPct = (v: number | null | undefined, def = 0) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(0, Math.min(100, n));
  };

  const show = {
    dailyBudget: ["daily_budget", "cpc", "cpm", "cpa"].includes(s.spend_model),
    cpc: s.spend_model === "cpc",
    cpm: s.spend_model === "cpm",
    cpaBid: s.spend_model === "cpa",
    referral: s.spend_model === "referral",
  };

  // Derived end-criterion values for this source only
  const appsPerDay = (s.apps_override != null ? Math.max(0, Number(s.apps_override)) : Math.max(0, Number(kpis.apps || 0)));
  const hiresPerDay = appsPerDay * conversion;
  const spendPerDay = (s.spend_model === 'referral' && s.referral_bonus_per_hire != null)
    ? (s.referral_bonus_per_hire * hiresPerDayKpi)
    : (kpis.spendDay || 0); // organic already normalized to daily in deriveKpis
  const daysBetween = (startISO?: string | null, endISO?: string | null) => {
    if (!startISO || !endISO) return 0;
    const a = new Date(startISO); a.setHours(0,0,0,0);
    const b = new Date(endISO); b.setHours(0,0,0,0);
    return Math.max(0, Math.floor((b.getTime()-a.getTime())/(1000*60*60*24)));
  };
  const addDaysISO = (startISO?: string | null, d?: number | null) => {
    if (!startISO || d == null) return null;
    const a = new Date(startISO); a.setDate(a.getDate() + Math.round(Math.max(0, d)));
    return a.toISOString().slice(0,10);
  };
  let derivedDays = 0, derivedBudget = 0, derivedHires = 0, derivedEndISO: string | null = null;
  if (s.end_type === 'date') {
    derivedDays = daysBetween(s.schedule?.start, s.end_date || undefined);
    derivedBudget = spendPerDay * derivedDays;
    derivedHires = hiresPerDay * derivedDays;
  } else if (s.end_type === 'hires') {
    derivedDays = hiresPerDay > 0 ? Math.max(0, Number(s.end_hires||0) / hiresPerDay) : 0;
    derivedBudget = spendPerDay * derivedDays;
    derivedHires = Math.max(0, Number(s.end_hires||0));
    derivedEndISO = addDaysISO(s.schedule?.start, derivedDays);
  } else if (s.end_type === 'budget') {
    derivedDays = spendPerDay > 0 ? Math.max(0, Number(s.end_budget||0) / spendPerDay) : 0;
    derivedBudget = Math.max(0, Number(s.end_budget||0));
    derivedHires = hiresPerDay * derivedDays;
    derivedEndISO = addDaysISO(s.schedule?.start, derivedDays);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Name</h3>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Source Name" className="col-span-8">
            <input className={input} value={s.name} onChange={(event) => set({ name: event.target.value })} />
          </FieldBox>
          <FieldBox label="Color" className="col-span-4">
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="w-10 h-8 border rounded"
                value={s.color}
                onChange={(event) => set({ color: event.target.value })}
              />
              <span className="text-sm">{s.color}</span>
            </div>
          </FieldBox>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Timing</h3>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Start Date" className="col-span-4">
            <input
              type="date"
              className={input}
              value={s.schedule?.start ?? ""}
              onChange={(event) => set({ schedule: { start: event.target.value || null } })}
            />
          </FieldBox>

          <FieldBox label="End Criterion" className="col-span-8">
            <div className="grid grid-cols-12 gap-2 items-center">
              <label className="col-span-4 flex items-center gap-2">
                <input
                  type="radio"
                  name={`end-${s.id}`}
                  checked={s.end_type === "date"}
                  onChange={() => set({ end_type: "date" })}
                />
                <span className="text-sm">Date</span>
              </label>
              <div className="col-span-8">
                <input
                  type={s.end_type === 'date' ? 'date' : 'text'}
                  className={`${input} text-right ${s.end_type !== 'date' ? 'bg-slate-100 text-blue-600' : ''}`}
                  readOnly={s.end_type !== "date"}
                  value={s.end_type === 'date' ? (s.end_date ?? '') : (derivedEndISO || '')}
                  onChange={(event) => set({ end_date: event.target.value || null })}
                  style={s.end_type !== 'date' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
                />
              </div>

              <label className="col-span-4 flex items-center gap-2">
                <input
                  type="radio"
                  name={`end-${s.id}`}
                  checked={s.end_type === "hires"}
                  onChange={() => set({ end_type: "hires" })}
                />
                <span className="text-sm">Hires</span>
              </label>
              <div className="col-span-8">
                <input
                  type={s.end_type === 'hires' ? 'number' : 'text'}
                  className={`${input} text-right ${s.end_type !== 'hires' ? 'bg-slate-100 text-blue-600' : ''}`}
                  readOnly={s.end_type !== "hires"}
                  value={s.end_type === 'hires' ? (s.end_hires ?? '') : Math.round(derivedHires)}
                  onChange={setNum("end_hires")}
                  style={s.end_type !== 'hires' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
                />
              </div>

              <label className="col-span-4 flex items-center gap-2">
                <input
                  type="radio"
                  name={`end-${s.id}`}
                  checked={s.end_type === "budget"}
                  onChange={() => set({ end_type: "budget" })}
                />
                <span className="text-sm">Budget</span>
              </label>
              <div className="col-span-8">
                <input
                  type={s.end_type === 'budget' ? 'number' : 'text'}
                  className={`${input} text-right ${s.end_type !== 'budget' ? 'bg-slate-100 text-blue-600' : ''}`}
                  readOnly={s.end_type !== "budget"}
                  value={s.end_type === 'budget' ? (s.end_budget ?? '') : Math.round(derivedBudget)}
                  onChange={setNum("end_budget")}
                  style={s.end_type !== 'budget' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
                />
              </div>
            </div>
          </FieldBox>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Cost</h3>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Spend Model" className="col-span-4">
            <select
              className={input}
              value={s.spend_model}
              onChange={(event) => set({ spend_model: event.target.value as SpendModel })}
            >
              <option value="organic">Organic</option>
              <option value="daily_budget">Daily_Budget</option>
              <option value="cpc">$ / Click</option>
              <option value="cpm">$ / 1000 views</option>
              <option value="cpa">$ / Application</option>
              <option value="referral">Referral</option>
            </select>
          </FieldBox>

          {s.spend_model !== 'organic' && show.dailyBudget && (
            <FieldBox label="Daily Budget ($/day)" className="col-span-4">
              <input
                type="number"
                className={`${input} text-right`}
                value={s.daily_budget ?? ""}
                onChange={setNum("daily_budget")}
              />
            </FieldBox>
          )}

          {s.spend_model === 'organic' && (
            <FieldBox label="Monthly Budget ($/month)" className="col-span-4">
              <input
                type="number"
                className={`${input} text-right`}
                value={s.daily_budget ?? ""}
                onChange={setNum("daily_budget")}
              />
            </FieldBox>
          )}

          {show.cpc && (
            <FieldBox label="$ / Click" className="col-span-4">
              <input type="number" className={`${input} text-right`} value={s.cpc ?? ""} onChange={setNum("cpc")} />
            </FieldBox>
          )}
          {show.cpm && (
            <FieldBox label="$ / 1000 views" className="col-span-4">
              <input type="number" className={`${input} text-right`} value={s.cpm ?? ""} onChange={setNum("cpm")} />
            </FieldBox>
          )}
          {show.cpaBid && (
            <FieldBox label="$ / Application" className="col-span-4">
              <input type="number" className={`${input} text-right`} value={s.cpa_bid ?? ""} onChange={setNum("cpa_bid")} />
            </FieldBox>
          )}
          {show.referral && (
            <FieldBox label="Bounty per Hire ($)" className="col-span-4">
              <input
                type="number"
                className={`${input} text-right`}
                value={s.referral_bonus_per_hire ?? ""}
                onChange={setNum("referral_bonus_per_hire")}
              />
            </FieldBox>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Performance</h3>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Apps/day" className="col-span-3">
            <input
              type="number"
              step="0.1"
              className={`${input} text-right`}
              value={appsValue ?? 0}
              onChange={setNum("apps_override")}
            />
          </FieldBox>
          <FieldBox label="Quality (%)" className="col-span-3">
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              className={`${input} text-right`}
              value={qualityValue ?? 0}
              onChange={setNum("quality_percent")}
            />
          </FieldBox>
          <FieldBox label="Hires/day" className="col-span-3">
            <div className="py-1 text-sm text-right text-blue-600 bg-slate-100 rounded-md px-2">
              {hiresPerDayKpi.toFixed(2)}
            </div>
          </FieldBox>
          <FieldBox label="Actual Spend" className="col-span-3">
            <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">{money0(spendUsed)}</div>
          </FieldBox>
        </div>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Cost per App" className="col-span-3">
            <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">{money0(cpaValue)}</div>
          </FieldBox>
          <FieldBox label="90-Day Retention" className="col-span-3">
            <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">82%</div>
          </FieldBox>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Funnel Metrics</h3>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="App → Interview" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            <div className="relative flex justify-end">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={`${pctInput} pr-6 w-[calc(100%-150px)] min-w-[120px]`}
                value={clampPct(s.funnel_app_to_interview, 5)}
                onChange={(e) => set({ funnel_app_to_interview: clampPct(Number(e.target.value), 5) })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 select-none">%</span>
            </div>
          </FieldBox>
          <FieldBox label="Interview → Offer" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            <div className="relative flex justify-end">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={`${pctInput} pr-6 w-[calc(100%-150px)] min-w-[120px]`}
                value={clampPct(s.funnel_interview_to_offer, 40)}
                onChange={(e) => set({ funnel_interview_to_offer: clampPct(Number(e.target.value), 40) })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 select-none">%</span>
            </div>
          </FieldBox>
          <FieldBox label="Offer → Background" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            <div className="relative flex justify-end">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={`${pctInput} pr-6 w-[calc(100%-150px)] min-w-[120px]`}
                value={clampPct(s.funnel_offer_to_background, 90)}
                onChange={(e) => set({ funnel_offer_to_background: clampPct(Number(e.target.value), 90) })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 select-none">%</span>
            </div>
          </FieldBox>
          <FieldBox label="Background → Hire" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            <div className="relative flex justify-end">
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                className={`${pctInput} pr-6 w-[calc(100%-150px)] min-w-[120px]`}
                value={clampPct(s.funnel_background_to_hire, 90)}
                onChange={(e) => set({ funnel_background_to_hire: clampPct(Number(e.target.value), 90) })}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 select-none">%</span>
            </div>
          </FieldBox>
          <FieldBox label="Applications → Hire" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            {(() => {
              const r1 = clampPct(s.funnel_app_to_interview ?? 5, 5) / 100;
              const r2 = clampPct(s.funnel_interview_to_offer ?? 40, 40) / 100;
              const r3 = clampPct(s.funnel_offer_to_background ?? 90, 90) / 100;
              const r4 = clampPct(s.funnel_background_to_hire ?? 90, 90) / 100;
              const total = r1 * r2 * r3 * r4;
              return (
                <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">
                  {(total * 100).toFixed(2)}%
                </div>
              );
            })()}
          </FieldBox>
          <FieldBox label="Cost per Hire" className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-3">
            {(() => {
              const r1 = clampPct(s.funnel_app_to_interview ?? 5, 5) / 100;
              const r2 = clampPct(s.funnel_interview_to_offer ?? 40, 40) / 100;
              const r3 = clampPct(s.funnel_offer_to_background ?? 90, 90) / 100;
              const r4 = clampPct(s.funnel_background_to_hire ?? 90, 90) / 100;
              const total = r1 * r2 * r3 * r4;
              const cph = total > 0 && cpaValue != null ? (cpaValue as number) / total : null;
              return (
                <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">
                  {cph == null ? '—' : `$${Math.round(cph as number).toLocaleString()}`}
                </div>
              );
            })()}
          </FieldBox>
        </div>
      </section>
    </div>
  );
}
