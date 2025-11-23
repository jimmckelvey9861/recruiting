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
  diminishing_exponent?: number | null
  saturation_rate?: number | null
  // Optional funnel metrics (percent values 0..100 from Sources tab)
  funnel_app_to_interview?: number | null
  funnel_interview_to_offer?: number | null
  funnel_offer_to_background?: number | null
  funnel_background_to_hire?: number | null
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

const APPLY_CPC = 0.12
const APPLY_DAILY = 0.10
const CTR = 0.015
const DEFAULT_FUNNEL_CONV = 0.64 * 0.84 * 0.86 * 0.60
const DEFAULT_DIMINISHING_EXPONENT = 0.85
const DEFAULT_SATURATION_RATE = 0.18
const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const getBeta = (s: SourceSnapshot) => {
  const candidate = Number((s as any).diminishing_exponent)
  if (!Number.isFinite(candidate)) return DEFAULT_DIMINISHING_EXPONENT
  return clampValue(candidate, 0.3, 1)
}
const getSaturationRate = (s: SourceSnapshot) => {
  const candidate = Number((s as any).saturation_rate)
  if (!Number.isFinite(candidate)) return DEFAULT_SATURATION_RATE
  return clampValue(candidate, 0.01, 1)
}
const getReferenceSpend = (s: SourceSnapshot) => {
  const candidate = Number(s.daily_budget)
  if (Number.isFinite(candidate) && candidate > 0) return Math.max(1, candidate)
  return 100
}
const linearAppsAtSpend = (s: SourceSnapshot, spend: number, conv: number): number => {
  if (spend <= 0) return 0
  switch (s.spend_model) {
    case 'cpa':
    case 'daily_budget': {
      const bid = Math.max(0.0001, Number(s.cpa_bid || 10))
      return spend / bid
    }
    case 'cpc': {
      const cpc = Math.max(0.0001, Number(s.cpc || 2))
      const clicks = spend / cpc
      return clicks * APPLY_CPC
    }
    case 'cpm': {
      const cpm = Math.max(0.0001, Number(s.cpm || 10))
      const impressions = (spend / cpm) * 1000
      const clicks = impressions * CTR
      return clicks * APPLY_DAILY
    }
    case 'referral': {
      const bounty = Math.max(0.0001, Number(s.referral_bonus_per_hire || 0))
      const maxApps = Math.max(0, Number(s.apps_override || 0))
      if (bounty <= 0 || conv <= 0) return 0
      const linear = spend / (bounty * conv)
      return Math.min(maxApps, linear)
    }
    default:
      return 0
  }
}
const spendToApps = (s: SourceSnapshot, spend: number, conv: number): number => {
  spend = Math.max(0, spend)
  if (spend <= 0) return 0
  if (s.spend_model === 'referral') {
    const maxApps = Math.max(0, Number(s.apps_override || 0))
    if (maxApps <= 0) return 0
    const bounty = Math.max(0.0001, Number(s.referral_bonus_per_hire || 0))
    if (bounty <= 0 || conv <= 0) return 0
    const scaled = spend / (bounty * conv)
    const k = getSaturationRate(s)
    return maxApps * (1 - Math.exp(-k * scaled))
  }
  const beta = getBeta(s)
  const Sref = getReferenceSpend(s)
  const Lref = linearAppsAtSpend(s, Sref, conv)
  if (Lref <= 0) return 0
  const r = Lref / Math.pow(Sref, beta)
  return r * Math.pow(spend, beta)
}
const marginalAppsPerDollar = (s: SourceSnapshot, spend: number, conv: number): number => {
  const delta = 1
  const a1 = spendToApps(s, spend, conv)
  const a2 = spendToApps(s, spend + delta, conv)
  return Math.max(0, a2 - a1) / delta
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
      // Extend the scheduled window by onboarding lag to allow hires to materialize
      const ONBOARDING_DELAY_DAYS = 3
      const activeDays = Math.ceil(planner.endValue / hpd)
      return daysBetween(planner.startDate, date) < (activeDays + ONBOARDING_DELAY_DAYS)
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
  const overallConv = Math.max(0, Math.min(1, Number(state.conversionRate) || 0))

  const funnelConvToHire = (s: SourceSnapshot): number => {
    const r1 = clampValue(Number((s as any).funnel_app_to_interview ?? 5) / 100, 0, 1)
    const r2 = clampValue(Number((s as any).funnel_interview_to_offer ?? 40) / 100, 0, 1)
    const r3 = clampValue(Number((s as any).funnel_offer_to_background ?? 90) / 100, 0, 1)
    const r4 = clampValue(Number((s as any).funnel_background_to_hire ?? 90) / 100, 0, 1)
    return r1 * r2 * r3 * r4
  }
  const fallbackConv = overallConv > 0 ? overallConv : DEFAULT_FUNNEL_CONV
  const perSourceConv = (s: SourceSnapshot) => {
    const conv = funnelConvToHire(s)
    return conv > 0 ? conv : Math.max(0.0001, fallbackConv)
  }
  const effectiveCPH = (s: SourceSnapshot): number => {
    const conv = Math.max(0.0001, perSourceConv(s))
    switch (s.spend_model) {
      case 'referral':
        return Math.max(0.0001, Number((s as any).referral_bonus_per_hire || 0))
      case 'cpa': {
        const cpa = Math.max(0.0001, Number(s.cpa_bid || 10))
        return cpa / conv
      }
      case 'cpc': {
        const cpc = Math.max(0.0001, Number(s.cpc || 2))
        const cpa = cpc / APPLY_CPC
        return cpa / conv
      }
      case 'cpm': {
        const cpm = Math.max(0.0001, Number(s.cpm || 10))
        const cpa = cpm / (1000 * CTR * APPLY_DAILY)
        return cpa / conv
      }
      case 'daily_budget': {
        const cpa = Math.max(0.0001, Number((s as any).cpa_bid || 10))
        return cpa / conv
      }
      default:
        return Number.POSITIVE_INFINITY
    }
  }

  let remaining = dailyLimit
  const alloc = new Map<string, number>()

  // 1) Threshold daily_budget sources: allocate only if fully funded
  const threshold = liveSources
    .filter((s) => s.spend_model === 'daily_budget' && (s.daily_budget || 0) > 0 && ((s as any).cpa_bid || 0) > 0)
    .sort((a, b) => effectiveCPH(a) - effectiveCPH(b))
  for (const s of threshold) {
    const need = Math.max(0, Number(s.daily_budget || 0))
    if (remaining >= need) {
      alloc.set(s.id, need)
      remaining -= need
    } else {
      alloc.set(s.id, 0)
    }
  }

  // 2) Scalable sources with diminishing returns
  type Scalable = { s: SourceSnapshot; conv: number; cap: number; spent: number }
  const scalable: Scalable[] = liveSources
    .filter((s) => s.spend_model === 'referral' || s.spend_model === 'cpc' || s.spend_model === 'cpm' || s.spend_model === 'cpa')
    .map((s) => {
      const conv = perSourceConv(s)
      const cap =
        s.spend_model === 'referral'
          ? Math.max(0, Number(s.referral_bonus_per_hire || 0)) * Math.max(0, Number(s.apps_override || 0)) * conv
          : (Number.isFinite(Number(s.daily_budget)) ? Math.max(0, Number(s.daily_budget)) : Number.POSITIVE_INFINITY)
      return { s, conv, cap, spent: 0 }
    })

  const step = 10
  let guard = 0
  while (remaining > 0 && guard < 5000) {
    guard++
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < scalable.length; i++) {
      const it = scalable[i]
      if (it.spent >= it.cap) continue
      const margApps = marginalAppsPerDollar(it.s, it.spent, it.conv)
      const score = margApps * it.conv
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx < 0 || bestScore <= 0) break
    const it = scalable[bestIdx]
    const room = it.cap - it.spent
    const take = Math.min(remaining, Math.max(1, Math.min(step, room)))
    it.spent += take
    remaining -= take
  }
  scalable.forEach((it) => {
    if (it.spent > 0) {
      alloc.set(it.s.id, (alloc.get(it.s.id) || 0) + it.spent)
    }
  })

  // 3) Compute applicants/day from allocations (exclude organic)
  let applicants = 0
  for (const s of liveSources) {
    if (s.spend_model === 'organic') continue
    const conv = perSourceConv(s)
    const spent = alloc.get(s.id) || 0
    if (s.spend_model === 'daily_budget') {
      const need = Math.max(0, Number(s.daily_budget || 0))
      if (spent >= need) applicants += Math.round(spendToApps(s, spent, conv))
    } else if (spent > 0) {
      applicants += Math.round(spendToApps(s, spent, conv))
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
    // No capacity to hire: short-circuit, avoid runaway days/endDate
    if (Hpd <= 0) {
      return { days: 0, budget: 0, hires: H, endDate: null };
    }
    days = clampPos(H / Math.max(Hpd, 1e-6));
    budget = S * days;
    hires = H;
  } else { // 'budget'
    const B = clampPos(Number(opts.endValue||0));
    // No budget/day capacity: short-circuit
    if (S <= 0) {
      return { days: 0, budget: B, hires: 0, endDate: null };
    }
    days = clampPos(B / Math.max(S, 1e-6));
    budget = B;
    hires = Hpd * days;
  }

  const endDate = days > 0 ? toISO(addDays(start, Math.round(days))) : null;
  return { days, budget, hires, endDate };
}

// ---- Shared cap calculator for Daily Budget sliders across tabs ----
export function getMaxDailySpendCap(): number {
  const stateSnap = getStateSnapshot();
  const sources = stateSnap.sources || [];
  // Use a consistent conversion for referral caps (align with Review panel defaults)
  const DEFAULT_CONV_FOR_CAP = 0.64 * 0.84 * 0.86 * 0.60; // ~0.277
  let cap = 0;
  for (const s of sources) {
    if (!s || !s.active) continue;
    if (s.spend_model === 'organic') continue;
    if (s.spend_model === 'referral') {
      const bounty = Math.max(0, Number(s.referral_bonus_per_hire || 0));
      const apps = Math.max(0, Number(s.apps_override || 0));
      cap += bounty * apps * Math.max(0.0001, DEFAULT_CONV_FOR_CAP);
    } else if (s.spend_model === 'daily_budget') {
      cap += Math.max(0, Number(s.daily_budget || 0));
    } else {
      // scalable; if a per-source daily_budget exists, treat as cap; otherwise do not increase max
      if (Number.isFinite(Number(s.daily_budget)) && Number(s.daily_budget) > 0) {
        cap += Math.max(0, Number(s.daily_budget));
      }
    }
  }
  const raw = Math.round(cap);
  return Math.max(0, raw);
}
