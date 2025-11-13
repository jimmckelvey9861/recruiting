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

let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach(l => l()) }

export function setPlanner(patch: Partial<PlannerInputs>) {
  state = { ...state, planner: { ...state.planner, ...patch } }
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
  const paid = sources.filter(s => s.active && ['daily_budget','cpc','cpm','cpa'].includes(s.spend_model))
  const referral = sources.filter(s => s.active && s.spend_model === 'referral')
  const otherApps = sources.filter(s => s.active && s.apps_override && !['daily_budget','cpc','cpm','cpa'].includes(s.spend_model))
    .reduce((sum, s) => sum + (s.apps_override || 0), 0)

  const activePaid = paid.length
  if (activePaid === 0) return otherApps

  const perSourceSpend = Math.max(0, planner.dailySpend) / activePaid
  let appsFromSpend = 0
  for (const s of paid) {
    // derive CPA preference order
    let cpa = Number(s.cpa_bid || 0)
    if (!cpa || cpa <= 0) cpa = 10 // conservative fallback
    appsFromSpend += perSourceSpend / cpa
  }

  // referral doesn't create applicants here; spend is per hire handled elsewhere
  return appsFromSpend + otherApps
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
  const toISO = (d: Date) => d.toISOString().slice(0,10);
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };

  if (!startISO) return { days: 0, budget: 0, hires: 0, endDate: null };
  const start = new Date(startISO);

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
