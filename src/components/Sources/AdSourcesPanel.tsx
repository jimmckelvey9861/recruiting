import { useMemo, useState, ChangeEvent } from "react";

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
  daily_cap_apps?: number | null;
  schedule?: Schedule;
  end_type?: EndCriterionType;
  end_date?: string | null;
  end_hires?: number | null;
  end_budget?: number | null;
};

const nonNeg = (n: unknown, def = 0) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : def);
const money0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const int0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : Number(n).toLocaleString();
const todayISO = () => new Date().toISOString().slice(0, 10);

function deriveKpis(source: AdSource) {
  const cap = nonNeg(source.daily_cap_apps ?? 0);
  let spendDay: number | null = null;
  let apps = 0;

  switch (source.spend_model) {
    case "organic": {
      spendDay = 0;
      apps = nonNeg(source.organic_per_day ?? 0);
      break;
    }
    case "daily_budget": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const impliedCpc = Math.max(0.0001, nonNeg(source.cpc ?? 2));
      const clicks = budget / impliedCpc;
      const applyRate = 0.1;
      apps = clicks * applyRate;
      spendDay = budget;
      break;
    }
    case "cpc": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const cpc = Math.max(0.0001, nonNeg(source.cpc ?? 0));
      const clicks = budget / cpc;
      const applyRate = 0.12;
      apps = clicks * applyRate;
      spendDay = budget;
      break;
    }
    case "cpm": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const cpm = Math.max(0.0001, nonNeg(source.cpm ?? 0));
      const impressions = (budget / cpm) * 1000;
      const ctr = 0.015;
      const clicks = impressions * ctr;
      const applyRate = 0.1;
      apps = clicks * applyRate;
      spendDay = budget;
      break;
    }
    case "cpa": {
      const budget = nonNeg(source.daily_budget ?? 0);
      const bid = Math.max(0.0001, nonNeg(source.cpa_bid ?? 0));
      apps = budget / bid;
      spendDay = budget;
      break;
    }
    case "referral": {
      spendDay = null;
      apps = nonNeg(source.organic_per_day ?? 0);
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
    },
  ];
}

export default function AdSourcesPanel() {
  const [sources, setSources] = useState<AdSource[]>(seed());
  const [activeId, setActiveId] = useState<string>(sources[0]?.id || "");
  const active = useMemo(() => sources.find((source) => source.id === activeId) || null, [sources, activeId]);

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
                      Apps/day: <b>{int0(Math.round(kpis.apps))}</b>
                    </span>
                    <span>
                      CPA: <b>{money0(kpis.cpa)}</b>
                    </span>
                    <span>
                      Spend/day: <b>{money0(kpis.spendDay)}</b>
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
                  <button
                    className="text-xs px-2 py-1 border rounded text-red-600"
                    onClick={() => remove(source.id)}
                  >
                    Delete
                  </button>
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
  const input = "w-full bg-transparent border border-gray-200 rounded-md px-2 py-1 text-sm";

  const show = {
    dailyBudget: ["daily_budget", "cpc", "cpm", "cpa"].includes(s.spend_model),
    cpc: s.spend_model === "cpc",
    cpm: s.spend_model === "cpm",
    cpaBid: s.spend_model === "cpa",
    referral: s.spend_model === "referral",
    organic: s.spend_model === "organic",
  };

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
                  type="date"
                  className={`${input} disabled:opacity-50`}
                  disabled={s.end_type !== "date"}
                  value={s.end_date ?? ""}
                  onChange={(event) => set({ end_date: event.target.value || null })}
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
                  type="number"
                  className={`${input} text-right disabled:opacity-50`}
                  disabled={s.end_type !== "hires"}
                  value={s.end_hires ?? ""}
                  onChange={setNum("end_hires")}
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
                  type="number"
                  className={`${input} text-right disabled:opacity-50`}
                  disabled={s.end_type !== "budget"}
                  value={s.end_budget ?? ""}
                  onChange={setNum("end_budget")}
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

          <FieldBox label="Daily Budget ($/day)" className="col-span-4">
            <input
              type="number"
              className={`${input} text-right`}
              value={s.daily_budget ?? ""}
              onChange={setNum("daily_budget")}
              disabled={!show.dailyBudget}
            />
          </FieldBox>
        </div>

        <div className="grid grid-cols-12 gap-3 items-center">
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
          {show.organic && (
            <FieldBox label="Organic Apps/day" className="col-span-4">
              <input
                type="number"
                className={`${input} text-right`}
                value={s.organic_per_day ?? ""}
                onChange={setNum("organic_per_day")}
              />
            </FieldBox>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Performance</h3>
        <p className="text-xs text-slate-500">Blue values are computed from actual results.</p>
        <div className="grid grid-cols-12 gap-3 items-center">
          <FieldBox label="Apps/day" className="col-span-3">
            <div className="py-1 text-sm text-right">{int0(Math.round(kpis.apps))}</div>
          </FieldBox>
          <FieldBox label="Quality (%)" className="col-span-3">
            <div className="py-1 text-sm text-right">75%</div>
          </FieldBox>
          <FieldBox label="Actual Spend" className="col-span-3">
            <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">
              {money0(kpis.spendDay)}
            </div>
          </FieldBox>
          <FieldBox label="Cost per App" className="col-span-3">
            <div className="py-1 px-2 text-sm text-right text-blue-600 bg-slate-100 rounded-md">
              {money0(kpis.cpa)}
            </div>
          </FieldBox>
        </div>
      </section>
    </div>
  );
}
