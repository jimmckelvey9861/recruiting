import { useEffect, useMemo, useState } from 'react'
import SankeyDiagram, { SankeySource, SankeyStage } from './SankeyDiagram'
import { setConversionRate } from '../../state/campaignPlan'
import { getStateSnapshot, useCampaignPlanVersion } from '../../state/campaignPlan'

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

  // Daily Spend Limit slider
  const suggestedLimit = useMemo(() => {
    const sum = liveSources
      .filter((s) => s.active && typeof s.daily_budget === 'number' && (s.daily_budget || 0) > 0)
      .reduce((acc, s) => acc + Math.max(0, Number(s.daily_budget || 0)), 0)
    return Math.min(1000, Math.round(sum) || 500)
  }, [liveSources])
  const [dailyLimit, setDailyLimit] = useState<number>(suggestedLimit)

  // Effective CPA for scalable sources (heuristics match Sources KPIs)
  const APPLY_CPC = 0.12
  const APPLY_DAILY = 0.10
  const CTR = 0.015
  const effectiveCPA = (s: any) => {
    switch (s.spend_model) {
      case 'cpa': return Math.max(0.0001, Number(s.cpa_bid || 10))
      case 'cpc': return Math.max(0.0001, Number(s.cpc || 2)) / APPLY_CPC
      case 'cpm': return Math.max(0.0001, Number(s.cpm || 10)) / (1000 * CTR * APPLY_DAILY)
      case 'daily_budget': return Math.max(0.0001, Number(s.cpa_bid || 10))
      default: return Number.POSITIVE_INFINITY
    }
  }

  const { stages, flowData, totals, alloc, sankeySources, appsPerDay, hiresPerDay } = useMemo(() => {
    const alloc = new Map<string, number>()
    let remaining = Math.max(0, dailyLimit)

    // 1) Thresholded daily_budget sources: allocate only if we can fully fund the daily budget
    const threshold = liveSources
      .filter((s) => s.active && s.spend_model === 'daily_budget' && (s.daily_budget || 0) > 0 && (s.cpa_bid || 0) > 0)
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

    // 2) Scalable sources (cpc/cpm/cpa) by cheapest effective CPA
    const scalable = liveSources
      .filter((s) => s.active && (s.spend_model === 'cpc' || s.spend_model === 'cpm' || s.spend_model === 'cpa'))
      .sort((a, b) => effectiveCPA(a) - effectiveCPA(b))

    for (const s of scalable) {
      if (remaining <= 0) break
      const cap = Number.isFinite(Number(s.daily_budget)) ? Math.max(0, Number(s.daily_budget)) : Number.POSITIVE_INFINITY
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

    const toInterview = firstRow.map((v) => Math.round(v * clamp(conversionRates.toInterview, 0, 1)))
    const toOffer = toInterview.map((v) => Math.round(v * clamp(conversionRates.toOffer, 0, 1)))
    const toBg = toOffer.map((v) => Math.round(v * clamp(conversionRates.toBackground, 0, 1)))
    const toHire = toBg.map((v) => Math.round(v * clamp(conversionRates.toHire, 0, 1)))

    const flowData = [firstRow, toInterview, toOffer, toBg, toHire]
    const totals = flowData.map((row) => row.reduce((sum, v) => sum + v, 0))

    const stages: SankeyStage[] = STAGE_DEFINITIONS.map((stg, idx) => ({ key: stg.key, label: stg.label, total: totals[idx] }))

    const sankeySources: SankeySource[] = liveSources.map((s) => ({ key: s.id, label: s.name, color: s.color || '#94a3b8' }))

    const appsPerDay = totals[0]
    const hiresPerDay = totals[totals.length - 1]

    return { stages, flowData, totals, alloc, sankeySources, appsPerDay, hiresPerDay }
  }, [liveSources, conversionRates, dailyLimit])

  // Publish overall conversion = product across stages
  useEffect(() => {
    const overall = [conversionRates.toInterview, conversionRates.toOffer, conversionRates.toBackground, conversionRates.toHire]
      .reduce((acc, r) => acc * clamp(r, 0, 1), 1)
    setConversionRate(overall)
  }, [conversionRates])

  const locationsLabel = selectedLocations.length ? selectedLocations.join(', ') : 'All Locations'
  const jobsLabel = selectedJobs.length ? selectedJobs.join(', ') : 'All Jobs'

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white border rounded-xl shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Pipeline Health</h2>
              <p className="text-sm text-gray-500">{jobsLabel} · {locationsLabel}</p>
            </div>
            <div className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-3 py-1">
              Allocate your Daily Spend across sources to maximize applicants.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sources + allocator */}
            <div className="bg-white rounded-lg shadow-sm p-5 border">
              <h2 className="text-sm font-semibold mb-4 text-gray-700 uppercase tracking-wide">Sources</h2>

              <div className="mb-3">
                <label className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                  <span>Daily Spend Limit</span>
                  <span className="text-slate-900">${Math.round(dailyLimit)}</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  step={10}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

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
                <div className="text-slate-600">Apps/day</div>
                <div className="col-span-2 text-right font-semibold">{appsPerDay.toLocaleString()}</div>
                <div className="text-slate-600">Hires/day</div>
                <div className="col-span-2 text-right font-semibold">{hiresPerDay.toLocaleString()}</div>
                <div className="text-slate-600">Spend/day</div>
                <div className="col-span-2 text-right font-semibold">${Math.round(dailyLimit).toLocaleString()}</div>
                <div className="text-slate-600">$/App</div>
                <div className="col-span-2 text-right font-semibold">{appsPerDay > 0 ? `$${Math.round(dailyLimit / appsPerDay)}` : '—'}</div>
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
