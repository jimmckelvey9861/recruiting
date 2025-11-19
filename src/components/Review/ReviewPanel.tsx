import { useEffect, useMemo, useState } from 'react'
import SankeyDiagram, { SankeySource, SankeyStage } from './SankeyDiagram'
import { setConversionRate, setPlanner, getMaxDailySpendCap } from '../../state/campaignPlan'
import { getStateSnapshot, useCampaignPlanVersion } from '../../state/campaignPlan'
import DailySpendSlider from '../common/DailySpendSlider'

interface ReviewPanelProps {
  selectedJobs: string[]
  selectedLocations: string[]
}

const STAGE_DEFINITIONS: { key: string; label: string }[] = [
  { key: 'applicants', label: 'Applicants' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
  { key: 'background', label: 'Background' },
  { key: 'hire', label: 'Hire' },
]

const DEFAULT_CONVERSION_RATES = {
  toInterview: 0.64,
  toOffer: 0.84,
  toBackground: 0.86,
  toHire: 0.6,
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export default function ReviewPanel({ selectedJobs, selectedLocations }: ReviewPanelProps) {
  const [conversionRates, setConversionRates] = useState(DEFAULT_CONVERSION_RATES)
  const planVersion = useCampaignPlanVersion()
  const liveSources = useMemo(() => getStateSnapshot().sources, [planVersion])

  const overallConvForCaps = useMemo(() => clamp(
    DEFAULT_CONVERSION_RATES.toInterview * DEFAULT_CONVERSION_RATES.toOffer * DEFAULT_CONVERSION_RATES.toBackground * DEFAULT_CONVERSION_RATES.toHire,
    0, 1
  ), [])

  // Compute theoretical max spend from active sources' caps
  const maxSpendCapRaw = useMemo(() => {
    let cap = 0
    let hasInfinite = false
    for (const s of liveSources) {
      if (!s.active) continue
      if (s.spend_model === 'organic') continue
      if (s.spend_model === 'referral') {
        const bounty = Math.max(0, Number(s.referral_bonus_per_hire || 0))
        const apps = Math.max(0, Number(s.apps_override || 0))
        const conv = Math.max(0, overallConvForCaps)
        cap += bounty * apps * conv
      } else if (s.spend_model === 'daily_budget') {
        cap += Math.max(0, Number(s.daily_budget || 0))
      } else {
        // scalable; cap to per-source daily_budget if present, else assume unbounded
        if (Number.isFinite(Number(s.daily_budget)) && Number(s.daily_budget) > 0) {
          cap += Math.max(0, Number(s.daily_budget))
        } else {
          hasInfinite = true
        }
      }
    }
    return hasInfinite ? Infinity : cap
  }, [liveSources, overallConvForCaps])

  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap()
    return Math.max(0, cap)
  }, [planVersion])

  // Read/write daily spend from planner to keep in sync with Data tab CampaignBuilder
  const plannerDaily = getStateSnapshot().planner.dailySpend || 0
  const dailyLimit = Math.min(plannerDaily, sliderMax)
  const step = 10
  const atMaxLimit = Number.isFinite(sliderMax) && (dailyLimit >= sliderMax || Math.abs(dailyLimit - sliderMax) <= step / 2)
  useEffect(() => {
    if (plannerDaily > sliderMax) {
      setPlanner({ dailySpend: sliderMax })
    }
  }, [plannerDaily, sliderMax])

  // Effective $/hire prioritization
  const APPLY_CPC = 0.12
  const APPLY_DAILY = 0.10
  const CTR = 0.015
  const funnelConvToHire = (s: any) => {
    const r1 = Math.max(0, Math.min(1, (s.funnel_app_to_interview ?? 5) / 100))
    const r2 = Math.max(0, Math.min(1, (s.funnel_interview_to_offer ?? 40) / 100))
    const r3 = Math.max(0, Math.min(1, (s.funnel_offer_to_background ?? 90) / 100))
    const r4 = Math.max(0, Math.min(1, (s.funnel_background_to_hire ?? 90) / 100))
    return r1 * r2 * r3 * r4
  }
  const effectiveCPH = (s: any) => {
    const conv = Math.max(0.0001, funnelConvToHire(s))
    switch (s.spend_model) {
      case 'referral':
        return Math.max(0.0001, Number(s.referral_bonus_per_hire || 0))
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
        const cpa = Math.max(0.0001, Number(s.cpa_bid || 10))
        return cpa / conv
      }
      default:
        return Number.POSITIVE_INFINITY
    }
  }

  const { stages, flowData, totals, alloc, sankeySources, appsPerDay, hiresPerDay, perSourceConvProducts } = useMemo(() => {
    const alloc = new Map<string, number>()
    let remaining = Math.max(0, dailyLimit)

    // 1) Thresholded daily_budget sources: allocate only if we can fully fund the daily budget
    const threshold = liveSources
      .filter((s) => s.active && s.spend_model === 'daily_budget' && (s.daily_budget || 0) > 0 && (s.cpa_bid || 0) > 0)
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

    // 2) Scalable sources (referral/cpc/cpm/cpa) by cheapest effective $/hire
    const scalable = liveSources
      .filter((s) => s.active && (s.spend_model === 'referral' || s.spend_model === 'cpc' || s.spend_model === 'cpm' || s.spend_model === 'cpa'))
      .sort((a, b) => effectiveCPH(a) - effectiveCPH(b))

    for (const s of scalable) {
      if (remaining <= 0) break
      // For referral, cap spend to fully cover expected referral hires per day = bounty * (apps_override * conv_source)
      const cap = s.spend_model === 'referral'
        ? Math.max(0, Number(s.referral_bonus_per_hire || 0)) * Math.max(0, Number(s.apps_override || 0)) * Math.max(0.0001, funnelConvToHire(s))
        : (Number.isFinite(Number(s.daily_budget)) ? Math.max(0, Number(s.daily_budget)) : Number.POSITIVE_INFINITY)
      const take = Math.min(remaining, cap)
      if (take > 0) {
        alloc.set(s.id, (alloc.get(s.id) || 0) + take)
        remaining -= take
      }
    }

    // 3) Build Sankey first column = applicants/day per source from allocations + organics
    const firstRow = liveSources.map((s) => {
      if (!s.active) return 0
      let apps = 0

      // Organic contributes applicants but no spend
      if (s.spend_model === 'organic') {
        const organicApps = Number(s.apps_override || 0)
        if (Number.isFinite(organicApps)) apps += Math.max(0, Math.round(organicApps))
      }

      const spent = alloc.get(s.id) || 0
      if (s.spend_model === 'daily_budget') {
        const need = Math.max(0, Number(s.daily_budget || 0))
        const cpa = Math.max(0.0001, Number(s.cpa_bid || 10))
        if (spent >= need) apps += Math.round(spent / cpa)
      } else if (s.spend_model === 'referral' && spent > 0) {
        const bounty = Math.max(0.0001, Number(s.referral_bonus_per_hire || 0))
        const conv = Math.max(0.0001, funnelConvToHire(s))
        const maxApps = Math.max(0, Number(s.apps_override || 0))
        const appsFromSpend = spent / (bounty * conv)
        apps += Math.round(Math.min(maxApps, appsFromSpend))
      } else if (s.spend_model === 'cpa' && spent > 0) {
        const bid = Math.max(0.0001, Number(s.cpa_bid || 10))
        apps += Math.round(spent / bid)
      } else if (s.spend_model === 'cpc' && spent > 0) {
        const cpc = Math.max(0.0001, Number(s.cpc || 2))
        const clicks = spent / cpc
        apps += Math.round(clicks * APPLY_CPC)
      } else if (s.spend_model === 'cpm' && spent > 0) {
        const cpm = Math.max(0.0001, Number(s.cpm || 10))
        const impressions = (spent / cpm) * 1000
        const clicks = impressions * CTR
        apps += Math.round(clicks * APPLY_DAILY)
      }

      return clamp(apps, 0, 999999)
    })

    // Per-source funnel rates (percent → fraction), fallback to defaults
    const r1 = liveSources.map((s) => clamp(((s as any).funnel_app_to_interview ?? (DEFAULT_CONVERSION_RATES.toInterview * 100)) / 100, 0, 1))
    const r2 = liveSources.map((s) => clamp(((s as any).funnel_interview_to_offer ?? (DEFAULT_CONVERSION_RATES.toOffer * 100)) / 100, 0, 1))
    const r3 = liveSources.map((s) => clamp(((s as any).funnel_offer_to_background ?? (DEFAULT_CONVERSION_RATES.toBackground * 100)) / 100, 0, 1))
    const r4 = liveSources.map((s) => clamp(((s as any).funnel_background_to_hire ?? (DEFAULT_CONVERSION_RATES.toHire * 100)) / 100, 0, 1))
    const toInterview = firstRow.map((v, i) => Math.round(v * r1[i]))
    const toOffer = toInterview.map((v, i) => Math.round(v * r2[i]))
    const toBg = toOffer.map((v, i) => Math.round(v * r3[i]))
    const toHire = toBg.map((v, i) => Math.round(v * r4[i]))

    const flowData = [firstRow, toInterview, toOffer, toBg, toHire]
    const totals = flowData.map((row) => row.reduce((sum, v) => sum + v, 0))

    const stages: SankeyStage[] = STAGE_DEFINITIONS.map((stg, idx) => ({ key: stg.key, label: stg.label, total: totals[idx] }))

    const sankeySources: SankeySource[] = liveSources.map((s) => ({ key: s.id, label: s.name, color: s.color || '#94a3b8' }))

    const appsPerDay = totals[0]
    const hiresPerDay = totals[totals.length - 1]
    const perSourceConvProducts = r1.map((_, i) => r1[i] * r2[i] * r3[i] * r4[i])

    return { stages, flowData, totals, alloc, sankeySources, appsPerDay, hiresPerDay, perSourceConvProducts }
  }, [liveSources, conversionRates, dailyLimit])

  // Publish overall conversion to shared store.
  // With per-source funnel metrics, derive a weighted overall conversion based on current mix.
  useEffect(() => {
    const overall = appsPerDay > 0 ? (hiresPerDay / Math.max(1, appsPerDay)) : (
      DEFAULT_CONVERSION_RATES.toInterview *
      DEFAULT_CONVERSION_RATES.toOffer *
      DEFAULT_CONVERSION_RATES.toBackground *
      DEFAULT_CONVERSION_RATES.toHire
    )
    setConversionRate(clamp(overall, 0, 1))
  }, [appsPerDay, hiresPerDay])

  const locationsLabel = selectedLocations.length ? selectedLocations.join(', ') : 'All Locations'
  const jobsLabel = selectedJobs.length ? selectedJobs.join(', ') : 'All Jobs'

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white border rounded-xl shadow-sm p-6">

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sources + allocator */}
            <div className="bg-white rounded-lg shadow-sm p-5 border">
              <h2 className="text-sm font-semibold mb-4 text-gray-700 uppercase tracking-wide">Sources</h2>

              <div className="mb-3">
                {/* Unified daily spend slider */}
                <DailySpendSlider label="Daily Spend Limit" />
              </div>

              {/* End Goal control removed per request; managed via Data/Needs tabs */}

              <div className="space-y-2">
                {sankeySources.length === 0 && (
                  <div className="text-xs text-gray-500">No sources configured. Open the Sources tab to add some.</div>
                )}
                {sankeySources.map((s) => {
                  const spent = alloc.get(s.key) || 0
                  const pct = dailyLimit > 0 ? (100 * spent / dailyLimit) : 0
                  return (
                    <div key={s.key} className="flex items-center gap-2 text-sm">
                      <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
                      <div className="flex-1 h-2 bg-slate-200 rounded overflow-hidden">
                        <div className="h-2" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      </div>
                      <div className="w-16 text-right">${Math.round(spent)}</div>
                    </div>
                  )
                })}
              </div>

              {/* Stats driven by allocation */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="text-slate-600 whitespace-nowrap">Apps/day</div>
                <div className="col-span-2 text-right font-semibold whitespace-nowrap">{appsPerDay.toLocaleString()}</div>
                <div className="text-slate-600 whitespace-nowrap">Hires/day</div>
                <div className="col-span-2 text-right font-semibold whitespace-nowrap">{hiresPerDay.toLocaleString()}</div>
                <div className="text-slate-600 whitespace-nowrap">$/Hire</div>
                <div className="col-span-2 text-right font-semibold whitespace-nowrap">
                  {hiresPerDay > 0 ? `$${Math.round(dailyLimit / hiresPerDay).toLocaleString()}` : '—'}
                </div>
                <div className="text-slate-600 whitespace-nowrap">$/App</div>
                <div className="col-span-2 text-right font-semibold whitespace-nowrap">{appsPerDay > 0 ? `$${Math.round(dailyLimit / appsPerDay)}` : '—'}</div>
              </div>
            </div>

            {/* Sankey Diagram */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <SankeyDiagram
                  sources={sankeySources}
                  stages={stages}
                  flowData={flowData}
                  options={{ showConversionRates: true, showRejectBar: false }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
