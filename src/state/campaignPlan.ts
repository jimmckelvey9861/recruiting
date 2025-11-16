import { useSyncExternalStore } from 'react'

export type EndType = 'date' | 'hires' | 'budget'

export interface PlannerInputs {
  startDate: string | null
  endType: EndType
  endValue: number | null // hires or budget amount; for date we normalize to days
  dailySpend: number // target spend per day
}

export interface SourceSnapshot {
  id: string
  name: string
  active: boolean
  spend_model: string
  color?: string | null
  cpa_bid?: number | null
  cpc?: number | null
  cpm?: number | null
  daily_budget?: number | null
  referral_bonus_per_hire?: number | null
  apps_override?: number | null
}

interface PlanState {
  planner: PlannerInputs
  conversionRate: number // applicants -> hires (0..1)
  sources: SourceSnapshot[]
  liveView: boolean
}

let state: PlanState = {
  planner: { startDate: null, endType: 'budget', endValue: null, dailySpend: 0 },
  conversionRate: 0.2,
  sources: [],
  liveView: true,
}
// hydrate from localStorage
try {
  const savedPlanner = localStorage.getItem('passcom-planner-v1')
  if (savedPlanner) {
    const pl = JSON.parse(savedPlanner)
    if (pl && typeof pl === 'object') {
      state.planner = { ...state.planner, ...pl }
    }
  }
  const savedLive = localStorage.getItem('passcom-liveview')
  if (savedLive != null) {
    state.liveView = savedLive === 'true'
  }
} catch {}

let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach(l => l()) }

export function setPlanner(patch: Partial<PlannerInputs>) {
  state = { ...state, planner: { ...state.planner, ...patch } }
  try { localStorage.setItem('passcom-planner-v1', JSON.stringify(state.planner)) } catch {}
  emit()
}

export function setConversionRate(rate: number) {
  const r = Math.max(0, Math.min(1, Number(rate) || 0))
  state = { ...state, conversionRate: r }
  emit()
}

export function setSourcesSnapshot(sources: SourceSnapshot[]) {
  state = { ...state, sources: sources.map(s => ({ ...s })) }
  emit()
}

export function setLiveView(enabled: boolean) {
  state = { ...state, liveView: !!enabled }
  try { localStorage.setItem('passcom-liveview', String(state.liveView)) } catch {}
  emit()
}

export function useCampaignPlanVersion(): number {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => version,
    () => version,
  )
}

// helpers
function daysBetween(startISO: string | null, date: Date): number {
  if (!startISO) return Infinity
  const s = new Date(startISO)
  s.setHours(0,0,0,0)
  const d0 = new Date(date)
  d0.setHours(0,0,0,0)
  const diff = (d0.getTime() - s.getTime()) / (1000*60*60*24)
  return Math.floor(diff)
}

export function isActiveOn(date: Date): boolean {
  if (!state.liveView) return false
  const { planner } = state
  if (!planner.startDate) return false
  if (daysBetween(planner.startDate, date) < 0) return false

  switch (planner.endType) {
    case 'date': {
      if (!planner.endValue) return true
      // endValue as days
      return daysBetween(planner.startDate, date) <= planner.endValue
    }
    case 'hires': {
      if (!planner.endValue) return true
      const hpd = getHiresPerDay()
      if (hpd <= 0) return false
      const activeDays = Math.ceil(planner.endValue / hpd)
      return daysBetween(planner.startDate, date) < activeDays
    }
    case 'budget': {
      if (!planner.endValue) return true
      const dailySpend = Math.max(0, planner.dailySpend)
      if (dailySpend <= 0) return false
      const activeDays = Math.ceil(planner.endValue / dailySpend)
      return daysBetween(planner.startDate, date) < activeDays
    }
  }
}

export function isScheduledOn(date: Date): boolean {
  const { planner } = state
  if (!planner.startDate) return false
  if (daysBetween(planner.startDate, date) < 0) return false
  switch (planner.endType) {
    case 'date': {
      if (!planner.endValue) return true
      return daysBetween(planner.startDate, date) <= planner.endValue
    }
    case 'hires': {
      if (!planner.endValue) return true
      const hpd = getHiresPerDay()
      if (hpd <= 0) return false
      const activeDays = Math.ceil(planner.endValue / hpd)
      return daysBetween(planner.startDate, date) < activeDays
    }
    case 'budget': {
      if (!planner.endValue) return true
      const dailySpend = Math.max(0, planner.dailySpend)
      if (dailySpend <= 0) return false
      const activeDays = Math.ceil(planner.endValue / dailySpend)
      return daysBetween(planner.startDate, date) < activeDays
    }
  }
}

// Derive blended apps/day from spend and sources
export function getApplicantsPerDay(): number {
  const { planner, sources } = state
  const dailyLimit = Math.max(0, Number(planner.dailySpend || 0))
  const liveSources = sources.filter(s => s.active)
  if (liveSources.length === 0) return 0

  // Heuristics aligned with Review allocator
  const APPLY_CPC = 0.12
  const APPLY_DAILY = 0.10
  const CTR = 0.015
  const overallConv = Math.max(0, Math.min(1, Number(state.conversionRate) || 0))

  const effectiveCPA = (s: SourceSnapshot): number => {
    switch (s.spend_model) {
      case 'cpa': return Math.max(0.0001, Number(s.cpa_bid || 10))
      case 'cpc': return Math.max(0.0001, Number(s.cpc || 2)) / APPLY_CPC
      case 'cpm': return Math.max(0.0001, Number(s.cpm || 10)) / (1000 * CTR * APPLY_DAILY)
      case 'daily_budget': return Math.max(0.0001, Number((s as any).cpa_bid || 10))
      default: return Number.POSITIVE_INFINITY
    }
  }

  let remaining = dailyLimit
  const alloc = new Map<string, number>()

  // 1) Threshold daily_budget sources: allocate only if fully funded
  const threshold = liveSources
    .filter((s) => s.spend_model === 'daily_budget' && (s.daily_budget || 0) > 0 && ((s as any).cpa_bid || 0) > 0)
    .sort((a, b) => effectiveCPA(a) - effectiveCPA(b))
  for (const s of threshold) {
    const need = Math.max(0, Number(s.daily_budget || 0))
    if (remaining >= need) {
      alloc.set(s.id, need)
      remaining -= need
    } else {
      alloc.set(s.id, 0)
    }
  }

  // 2) Scalable sources (referral/cpc/cpm/cpa) cheapest first
  const scalable = liveSources
    .filter((s) => s.spend_model === 'referral' || s.spend_model === 'cpc' || s.spend_model === 'cpm' || s.spend_model === 'cpa')
    .sort((a, b) => {
      const cpaA = a.spend_model === 'referral'
        ? Math.max(0.0001, Number(a.referral_bonus_per_hire || 0)) * Math.max(0.0001, overallConv)
        : effectiveCPA(a)
      const cpaB = b.spend_model === 'referral'
        ? Math.max(0.0001, Number(b.referral_bonus_per_hire || 0)) * Math.max(0.0001, overallConv)
        : effectiveCPA(b)
      return cpaA - cpaB
    })
  for (const s of scalable) {
    if (remaining <= 0) break
    const cap = s.spend_model === 'referral'
      ? Math.max(0, Number(s.referral_bonus_per_hire || 0)) * Math.max(0, Number(s.apps_override || 0)) * Math.max(0.0001, overallConv)
      : (Number.isFinite(Number(s.daily_budget)) ? Math.max(0, Number(s.daily_budget)) : Number.POSITIVE_INFINITY)
    const take = Math.min(remaining, cap)
    if (take > 0) {
      alloc.set(s.id, (alloc.get(s.id) || 0) + take)
      remaining -= take
    }
  }

  // 3) Compute applicants/day from allocations + organics
  let applicants = 0
  for (const s of liveSources) {
    // Organic contributes applicants but no spend
    if (s.spend_model === 'organic') {
      const organicApps = Number(s.apps_override || 0)
      if (Number.isFinite(organicApps)) applicants += Math.max(0, Math.round(organicApps))
      continue
    }

    const spent = alloc.get(s.id) || 0
    if (s.spend_model === 'daily_budget') {
      const need = Math.max(0, Number(s.daily_budget || 0))
      const cpa = Math.max(0.0001, Number((s as any).cpa_bid || 10))
      if (spent >= need) applicants += Math.round(spent / cpa)
    } else if (s.spend_model === 'referral' && spent > 0) {
      const bounty = Math.max(0.0001, Number(s.referral_bonus_per_hire || 0))
      const conv = Math.max(0.0001, overallConv)
      const maxApps = Math.max(0, Number(s.apps_override || 0))
      const appsFromSpend = spent / (bounty * conv)
      applicants += Math.round(Math.min(maxApps, appsFromSpend))
    } else if (s.spend_model === 'cpa' && spent > 0) {
      const bid = Math.max(0.0001, Number(s.cpa_bid || 10))
      applicants += Math.round(spent / bid)
    } else if (s.spend_model === 'cpc' && spent > 0) {
      const cpc = Math.max(0.0001, Number(s.cpc || 2))
      const clicks = spent / cpc
      applicants += Math.round(clicks * APPLY_CPC)
    } else if (s.spend_model === 'cpm' && spent > 0) {
      const cpm = Math.max(0.0001, Number(s.cpm || 10))
      const impressions = (spent / cpm) * 1000
      const clicks = impressions * CTR
      applicants += Math.round(clicks * APPLY_DAILY)
    }
  }

  return applicants
}

export function getHiresPerDay(): number {
  const apps = getApplicantsPerDay()
  return apps * state.conversionRate
}

export function getExtraSupplyHalfHoursPerDay(): number {
  // Each hire contributes 30 hours/week = 60 half-hours per week = ~8.571 per day
  const hires = getHiresPerDay()
  return (hires * 30 / 7) * 2
}

export function getStateSnapshot() { return state }

export function getDerivedFromCriterion(opts: {
  startISO: string | null;
  endType: EndType;
  endValue: number | null; // days for 'date', hires for 'hires', dollars for 'budget'
  dailySpend: number;
}): { days: number; budget: number; hires: number; endDate: string | null } {
  const startISO = opts.startISO;
  const S = Math.max(0, Number(opts.dailySpend||0));
  const A = getApplicantsPerDay();
  const r = getStateSnapshot().conversionRate;
  const Hpd = A * r;
  const toISO = (d: Date): string | null => {
    const t = d instanceof Date ? d.getTime() : NaN;
    if (isNaN(t)) return null;
    try {
      return new Date(t).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  };
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  if (!startISO) return { days: 0, budget: 0, hires: 0, endDate: null };
  const start = new Date(startISO);
  // Guard invalid date strings to prevent RangeError in toISOString
  if (isNaN(start.getTime())) {
    return { days: 0, budget: 0, hires: 0, endDate: null };
  }

  const clampPos = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

  let days = 0, budget = 0, hires = 0;
  if (opts.endType === 'date') {
    days = clampPos(Number(opts.endValue||0));
    budget = S * days;
    hires = Hpd * days;
  } else if (opts.endType === 'hires') {
    const H = clampPos(Number(opts.endValue||0));
    days = clampPos(H / Math.max(Hpd, 1e-6));
    budget = S * days;
    hires = H;
  } else { // 'budget'
    const B = clampPos(Number(opts.endValue||0));
    days = clampPos(B / Math.max(S, 1e-6));
    budget = B;
    hires = Hpd * days;
  }

  const endDate = toISO(addDays(start, Math.round(days)));
  return { days, budget, hires, endDate };
}
