import { useEffect, useMemo, useState } from 'react'
import SankeyDiagram, { SankeySource, SankeyStage } from './SankeyDiagram'
import { SOURCE_COLORS, SOURCE_LABELS, SOURCE_OPTIONS } from '../../constants/sourceColors'

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

  const sources: SankeySource[] = useMemo(
    () =>
      REVIEW_SOURCE_KEYS.map((key) => ({
        key,
        label: SOURCE_LABELS[key] ?? key,
        color: SOURCE_COLORS[key] ?? '#94a3b8',
      })),
    []
  )

  const { stages, flowData, totals } = useMemo(() => {
    const stageRows: number[][] = []
    const firstRow = REVIEW_SOURCE_KEYS.map((key) => clamp(Math.round(sourceValues[key] ?? 0), 0, 9999))
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
  }, [sourceValues, conversionRates])

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
            {/* Controls */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-4">Initial Sources</h3>
                <div className="space-y-4">
                  {sources.map((source) => (
                    <div key={source.key}>
                      <label className="flex items-center justify-between text-sm font-medium text-slate-700 mb-1">
                        <span className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded" style={{ backgroundColor: source.color }} />
                          {source.label}
                        </span>
                        <span className="text-slate-900 font-semibold">{sourceValues[source.key as SourceKey]}</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={600}
                        value={sourceValues[source.key as SourceKey]}
                        onChange={(event) => updateSourceValue(source.key as SourceKey, event.target.value)}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-4">Conversion Rates</h3>
                <div className="space-y-4">
                  <div>
                    <label className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                      <span>App → Interview</span>
                      <span className="text-slate-900 font-semibold">{Math.round(conversionRates.toInterview * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={conversionRates.toInterview}
                      onChange={(event) => updateConversionRate('toInterview', event.target.value)}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                      <span>Interview → Offer</span>
                      <span className="text-slate-900 font-semibold">{Math.round(conversionRates.toOffer * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={conversionRates.toOffer}
                      onChange={(event) => updateConversionRate('toOffer', event.target.value)}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                      <span>Offer → Background</span>
                      <span className="text-slate-900 font-semibold">{Math.round(conversionRates.toBackground * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={conversionRates.toBackground}
                      onChange={(event) => updateConversionRate('toBackground', event.target.value)}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                      <span>Background → Hire</span>
                      <span className="text-slate-900 font-semibold">{Math.round(conversionRates.toHire * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={conversionRates.toHire}
                      onChange={(event) => updateConversionRate('toHire', event.target.value)}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
                <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-4">Pipeline Stats</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Applicants:</span>
                    <span className="font-semibold text-slate-900">{totalApplicants.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Final Hires:</span>
                    <span className="font-semibold text-slate-900">{finalHires.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="text-slate-600">Overall Rate:</span>
                    <span className="font-semibold text-slate-900">{overallRate}%</span>
                  </div>
                </div>
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
