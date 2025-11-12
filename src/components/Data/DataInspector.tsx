import { useMemo, useState, ChangeEvent } from 'react'
import { genWeek, DISPLAY_START_HOUR, DISPLAY_END_HOUR, DAYS } from '../Campaign/CoverageHeatmap'
import { setOverride, clearRoleWeekOverrides, hasOverride, useOverrideVersion } from '../../state/dataOverrides'

const SLOT_COUNT = (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 2

const slotIndices = Array.from({ length: SLOT_COUNT }, (_, index) => index + DISPLAY_START_HOUR * 2)

const toTimeLabel = (slotIndex: number) => {
  const hour = Math.floor(slotIndex / 2)
  const minutes = slotIndex % 2 === 0 ? '00' : '30'
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const displayHour = ((hour + 11) % 12) + 1
  return `${displayHour}:${minutes} ${suffix}`
}

const mondayOf = (offsetWeeks = 0) => {
  const now = new Date()
  const day = (now.getDay() + 6) % 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + offsetWeeks * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

const addDays = (date: Date, amount: number) => {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + amount)
  return copy
}

const formatRangeLabel = (weekOffset: number) => {
  const start = mondayOf(weekOffset)
  const end = addDays(start, 6)
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  return `${formatter.format(start)} – ${formatter.format(end)}`
}

interface DataInspectorProps {
  job: string
}

export default function DataInspector({ job }: DataInspectorProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  const overrideVersion = useOverrideVersion()

  const weekData = useMemo(() => genWeek(job, weekOffset, false), [job, weekOffset, overrideVersion])

  const handleValueChange = (dayIdx: number, slotIdx: number, field: 'demand' | 'supply') => (event: ChangeEvent<HTMLInputElement>) => {
    const slot = weekData[dayIdx]?.[slotIdx]
    if (!slot || slot.closed) return
    const raw = Number(event.target.value)
    const nextValue = Number.isFinite(raw) ? raw : 0
    const demand = field === 'demand' ? nextValue : slot.demand
    const supply = field === 'supply' ? nextValue : slot.supply
    setOverride(job, weekOffset, dayIdx, slotIdx, { demand, supply })
  }

  const handleReset = () => {
    clearRoleWeekOverrides(job, weekOffset)
  }

  return (
    <div className="bg-white border rounded-xl shadow-sm p-4 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Raw Coverage Data • {job}</h3>
          <p className="text-xs text-slate-500">Blue = demand, Red = supply. Edit values to override generated data.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
            className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-100"
          >
            ◀ Prev
          </button>
          <div className="text-xs font-medium text-slate-600 min-w-[120px] text-center">
            {formatRangeLabel(weekOffset)}
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
            className="px-2 py-1 border border-slate-300 rounded text-xs hover:bg-slate-100"
          >
            Next ▶
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="ml-2 px-2 py-1 border border-red-300 text-red-600 rounded text-xs hover:bg-red-50"
          >
            Reset Week Overrides
          </button>
        </div>
      </div>

      <div className="overflow-auto border border-slate-200 rounded-lg">
        <div className="grid" style={{ gridTemplateColumns: `80px repeat(7, minmax(120px, 1fr))` }}>
          <div className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 sticky left-0">
            Time
          </div>
          {DAYS.map((day) => (
            <div
              key={day}
              className="bg-slate-100 border-b border-r border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 text-center"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="max-h-[540px] overflow-auto">
          {slotIndices.map((slotIdx) => {
            const rowKey = `time-${slotIdx}`
            return (
              <div key={rowKey} className="grid" style={{ gridTemplateColumns: `80px repeat(7, minmax(120px, 1fr))` }}>
                <div className="border-r border-slate-200 px-2 py-3 text-xs font-medium text-slate-600 bg-white sticky left-0">
                  {toTimeLabel(slotIdx)}
                </div>
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                  const slot = weekData[dayIdx]?.[slotIdx]
                  const closed = slot?.closed || false
                  const overrideActive = hasOverride(job, weekOffset, dayIdx, slotIdx)

                  if (!slot || closed) {
                    return (
                      <div
                        key={`${rowKey}-${dayIdx}`}
                        className="border-r border-slate-200 px-2 py-3 text-center text-[11px] text-slate-400 bg-slate-50"
                      >
                        Closed
                      </div>
                    )
                  }

                  return (
                    <div
                      key={`${rowKey}-${dayIdx}`}
                      className={`border-r border-slate-200 px-2 py-2 bg-white ${overrideActive ? 'bg-blue-50/40' : ''}`}
                    >
                      <div className="flex flex-col gap-1 items-center">
                        <input
                          type="number"
                          min={0}
                          value={slot.demand}
                          onChange={handleValueChange(dayIdx, slotIdx, 'demand')}
                          className="w-full text-center text-xs font-semibold text-blue-600 border border-blue-200 rounded px-1 py-1 focus:outline-none focus:border-blue-400 focus:ring-0"
                        />
                        <input
                          type="number"
                          min={0}
                          value={slot.supply}
                          onChange={handleValueChange(dayIdx, slotIdx, 'supply')}
                          className="w-full text-center text-xs font-semibold text-red-600 border border-red-200 rounded px-1 py-1 focus:outline-none focus:border-red-400 focus:ring-0"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
