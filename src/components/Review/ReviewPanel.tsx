import { useEffect, useMemo, useState } from 'react'
import SankeyDiagram, { SankeySource, SankeyStage } from './SankeyDiagram'
import { SOURCE_COLORS, SOURCE_LABELS, SOURCE_OPTIONS } from '../../constants/sourceColors'
import { setConversionRate } from '../../state/campaignPlan'
import { getStateSnapshot, useCampaignPlanVersion } from '../../state/campaignPlan'

interface ReviewPanelProps {
  selectedJobs: string[]
  selectedLocations: string[]
}

type SourceKey = 'linkedin' | 'referrals' | 'job_boards' | 'facebook' | 'indeed'

const REVIEW_SOURCE_KEYS: SourceKey[] = ['linkedin', 'referrals', 'job_boards', 'facebook', 'indeed']

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

  const initialSourceValues = useMemo(() => {
    const jobFactor = 1 + Math.max(0, selectedJobs.length - 1) * 0.3
    const locationFactor = 1 + Math.max(0, selectedLocations.length - 1) * 0.24

    const baseValues: Record<SourceKey, number> = {
      linkedin: 0,
      referrals: 0,
      job_boards: 0,
      facebook: 0,
      indeed: 0,
    }

    REVIEW_SOURCE_KEYS.forEach((key) => {
      const option = SOURCE_OPTIONS.find((opt) => opt.key === key)
      const base = option?.baseCount ?? 40
      baseValues[key] = Math.round(base * jobFactor * locationFactor)
    })

    return baseValues
  }, [selectedJobs, selectedLocations])

  const [sourceValues, setSourceValues] = useState<Record<SourceKey, number>>(initialSourceValues)

  useEffect(() => {
    setSourceValues(initialSourceValues)
  }, [initialSourceValues])

  const sources: SankeySource[] = useMemo(() =>
    liveSources.map((s) => ({ key: s.id, label: s.name, color: s.color || '#94a3b8' })), [liveSources]
  )

  const { stages, flowData, totals } = useMemo(() => {
    const stageRows: number[][] = [];
    const firstRow = liveSources.map((s) => {
      if (!s.active) return 0;
      const budget = Math.max(0, Number(s.daily_budget || 0));
      let apps = 0;
      // include manual override if present
      if (s.apps_override != null) apps += Math.max(0, Number(s.apps_override));

      switch (s.spend_model) {
        case 'cpc': {
          const cpc = Math.max(0.0001, Number(s.cpc || 2));
          const clicks = budget / cpc;
          const applyRate = 0.12; // match Sources KPIs
          apps += clicks * applyRate;
          break;
        }
        case 'cpm': {
          const cpm = Math.max(0.0001, Number(s.cpm || 10));
          const impressions = (budget / cpm) * 1000;
          const ctr = 0.015;
          const clicks = impressions * ctr;
          const applyRate = 0.10;
          apps += clicks * applyRate;
          break;
        }
        case 'daily_budget': {
          const impliedCpc = Math.max(0.0001, Number(s.cpc || 2));
          const clicks = budget / impliedCpc;
          const applyRate = 0.10;
          apps += clicks * applyRate;
          break;
        }
        case 'cpa': {
          const bid = Math.max(0.0001, Number(s.cpa_bid || 10));
          apps += budget / bid;
          break;
        }
        case 'referral': {
          // already counted via apps_override (if provided)
          break;
        }
        default:
          break;
      }
      return clamp(Math.round(apps), 0, 999999);
    })
    stageRows.push(firstRow)

    const conversions = [
      conversionRates.toInterview,
      conversionRates.toOffer,
      conversionRates.toBackground,
      conversionRates.toHire,
    ]

    conversions.forEach((rate, idx) => {
      const previousRow = stageRows[idx]
      const nextRow = previousRow.map((value) => Math.round(value * clamp(rate, 0, 1)))
      stageRows.push(nextRow)
    })

    const totalsByStage = stageRows.map((row) => row.reduce((sum, value) => sum + value, 0))

    const sankeyStages: SankeyStage[] = STAGE_DEFINITIONS.map((definition, idx) => ({
      key: definition.key,
      label: definition.label,
      total: totalsByStage[idx] ?? 0,
    }))

    return { stages: sankeyStages, flowData: stageRows, totals: totalsByStage }
  }, [liveSources, conversionRates])

  // Publish overall conversion = product of stages (excluding final 100%)
  useEffect(() => {
    const overall = [
      conversionRates.toInterview,
      conversionRates.toOffer,
      conversionRates.toBackground,
      conversionRates.toHire,
    ].reduce((acc, r) => acc * Math.max(0, Math.min(1, r)), 1)
    setConversionRate(overall)
  }, [conversionRates])

  const locationsLabel = selectedLocations.length ? selectedLocations.join(', ') : 'All Locations'
  const jobsLabel = selectedJobs.length ? selectedJobs.join(', ') : 'All Jobs'

  const updateSourceValue = (key: SourceKey, value: string) => {
    const numeric = clamp(parseInt(value, 10) || 0, 0, 9999)
    setSourceValues((prev) => ({ ...prev, [key]: numeric }))
  }

  const updateConversionRate = (key: keyof typeof DEFAULT_CONVERSION_RATES, value: string) => {
    const numeric = clamp(parseFloat(value) || 0, 0, 1)
    setConversionRates((prev) => ({ ...prev, [key]: numeric }))
  }

  const totalApplicants = totals[0] ?? 0
  const finalHires = totals[totals.length - 1] ?? 0
  const overallRate = totalApplicants > 0 ? Math.round((finalHires / totalApplicants) * 100) : 0

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
              Adjust source mix and conversions to forecast hiring throughput.
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sources list (live from Sources tab) */}
            <div className="bg-white rounded-lg shadow-sm p-5 border">
              <h2 className="text-sm font-semibold mb-4 text-gray-700 uppercase tracking-wide">Sources</h2>
              <div className="space-y-2">
                {liveSources.length === 0 && (
                  <div className="text-xs text-gray-500">No sources configured. Open the Sources tab to add some.</div>
                )}
                {liveSources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-3 h-3 rounded" style={{ backgroundColor: s.color || '#94a3b8' }} />
                    <span className="truncate">{s.name}</span>
                    {!s.active && <span className="ml-auto text-xs text-gray-500">paused</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Sankey Diagram */}
            <div className="lg:col-span-3">
              <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
                <SankeyDiagram
                  sources={sources}
                  stages={stages}
                  flowData={flowData}
                  options={{
                    showConversionRates: true,
                    showRejectBar: false,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
