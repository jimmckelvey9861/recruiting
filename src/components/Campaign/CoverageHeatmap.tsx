import { useMemo, useState, useEffect, useRef } from "react"
import { getOverride, useOverrideVersion } from "../../state/dataOverrides"
import { useCampaignPlanVersion, getExtraSupplyHalfHoursPerDay, isScheduledOn } from "../../state/campaignPlan"

export const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
// (Removed unused HALF_HOUR_SLOTS to eliminate linter warnings)

// Base colors for each job role (exact colors from user specification)
export const JOB_BASE_COLORS: Record<string, string> = {
  "Server": "#D72A4D",       // Red
  "Cook": "#FB8331",         // Orange
  "Bartender": "#FFCB03",    // Yellow
  "Security": "#21BF6B",     // Green
  "Dishwasher": "#12B9B1",   // Teal
  "Manager": "#2E98DB",      // Light Blue
  "Cleaner": "#3967D6",      // Dark Blue
  "Barista": "#8855D0"       // Purple
}

const JOB_ATTRITION: Record<string, { base: number, lossEveryWeeks: number, lossAmount: number }> = {
  "Server": { base: 30, lossEveryWeeks: 1, lossAmount: 1 },
  "Cook": { base: 5, lossEveryWeeks: 2, lossAmount: 1 },
  "Bartender": { base: 10, lossEveryWeeks: 1, lossAmount: 1 }
}

const COLORS = {
  closed: "#e5e7eb"
}

export const DISPLAY_START_HOUR = 7
export const DISPLAY_END_HOUR = 23
type Slot = { demand: number; supply: number; closed: boolean }

// Utility clamp
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 }
}

// Helper to convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(255, x))).toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }).join("")
}

// Precompute role palette for 7 divisions (-3..+3) to avoid repeated math in large grids
function paletteForRole(role: string): string[] {
  const baseColor = JOB_BASE_COLORS[role] || "#3498DB"
  const rgb = hexToRgb(baseColor)
  // indices: 0..6 map to -3..+3; index 3 is neutral
  const colors: string[] = new Array(7)
  // Neutral
  colors[3] = baseColor
  // Oversupply (+1..+3): blend towards white at 33%, 66%, 100%
  const toWhite = (t: number) => rgbToHex(
    rgb.r + (255 - rgb.r) * t,
    rgb.g + (255 - rgb.g) * t,
    rgb.b + (255 - rgb.b) * t,
  )
  colors[4] = toWhite(1/3)
  colors[5] = toWhite(2/3)
  colors[6] = toWhite(1)
  // Undersupply (-1..-3): blend towards black at 33%, 66%, 100%
  const toBlack = (t: number) => rgbToHex(
    rgb.r * (1 - t),
    rgb.g * (1 - t),
    rgb.b * (1 - t),
  )
  colors[2] = toBlack(1/3)
  colors[1] = toBlack(2/3)
  colors[0] = toBlack(1)
  return colors
}

// Calculate color based on supply/demand delta
// 7 divisions: -3 (black), -2, -1, 0 (base), +1, +2, +3 (white)
// Each division is 10% staffing increment
function cellColor(demand: number, supply: number, role: string): string {
  if (demand <= 0 && supply <= 0) return COLORS.closed
  
  const baseColor = JOB_BASE_COLORS[role] || "#3498DB"
  const rgb = hexToRgb(baseColor)
  
  // Calculate delta as a percentage
  const delta = (supply - demand) / Math.max(1, demand)
  
  // Determine division level (-3 to +3)
  let level = 0
  if (delta <= -0.30) level = -3       // -30% or worse → black
  else if (delta <= -0.20) level = -2  // -20% to -30%
  else if (delta <= -0.10) level = -1  // -10% to -20%
  else if (delta >= 0.30) level = 3    // +30% or more → white
  else if (delta >= 0.20) level = 2    // +20% to +30%
  else if (delta >= 0.10) level = 1    // +10% to +20%
  // else level = 0 (balanced, -10% to +10%)
  
  if (level > 0) {
    // Oversupply: blend towards white
    // level 1 = 33% white, level 2 = 66% white, level 3 = 100% white
    const whiteBlend = level / 3
    const r = rgb.r + (255 - rgb.r) * whiteBlend
    const g = rgb.g + (255 - rgb.g) * whiteBlend
    const b = rgb.b + (255 - rgb.b) * whiteBlend
    return rgbToHex(r, g, b)
  } else if (level < 0) {
    // Undersupply: blend towards black
    // level -1 = 33% black, level -2 = 66% black, level -3 = 100% black
    const blackBlend = Math.abs(level) / 3
    const r = rgb.r * (1 - blackBlend)
    const g = rgb.g * (1 - blackBlend)
    const b = rgb.b * (1 - blackBlend)
    return rgbToHex(r, g, b)
  } else {
    // Balanced: return base color
    return baseColor
  }
}

// Calculate the level to display in cell (-3 to +3)
function getDeltaDisplay(demand: number, supply: number): string {
  if (demand <= 0) return ""
  const level = getDivision(demand, supply)
  if (level === -99) return "" // closed
  if (level === 0) return ""   // balanced
  return level > 0 ? `+${level}` : `${level}`
}

function isOpen(dayIdx: number, hour: number) {
  if (dayIdx <= 4) return hour >= 8 && hour < 20
  return hour >= 10 && hour < 22
}

function noise(seed: number, d: number, s: number) {
  const x = Math.sin((seed + 1) * 9301 + d * 49297 + s * 233280) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// Box-Muller transform to generate normally distributed random numbers
export function genWeek(
  role: string,
  weekOffset = 0,
  withCampaign = false,
  overlayForRole?: string
) {
  // Base demand levels for each role
  const baseMap: Record<string, number> = {
    "Server": 8,
    "Cook": 10,
    "Bartender": 6,
    "Security": 3,
    "Dishwasher": 5,
    "Manager": 2,
    "Cleaner": 4,
    "Barista": 7
  }
  
  const base = baseMap[role] || 5
  const attr = JOB_ATTRITION[role]
  // Determine if there is actual spend configured; campaign effects should not apply without spend
  const hasSpendGlobal = getExtraSupplyHalfHoursPerDay() > 0;

  const attrFactor = (() => {
    if (!attr) return 1
    const losses = Math.floor(weekOffset / attr.lossEveryWeeks) * attr.lossAmount
    const available = Math.max(attr.base - losses, 0)
    let factor = attr.base > 0 ? available / attr.base : 1
    // Only apply campaign bump to the targeted role (or all if overlayForRole not specified)
    const campaignApplies = withCampaign && (!overlayForRole || overlayForRole === role) && hasSpendGlobal
    if (campaignApplies) {
      factor = clamp(factor + 0.1, 0, 1.25)
    }
    return factor
  })()
  
  const weekData = Array.from({ length: 7 }, (_, d) => (
    Array.from({ length: 48 }, (_, s) => {
      const hour = Math.floor(s / 2)
      const open = isOpen(d, hour)
      if (!open) return { demand: 0, supply: 0, closed: true }
      const lunch = Math.exp(-Math.pow((hour - 12) / 2, 2))
      const dinner = Math.exp(-Math.pow((hour - 19) / 2, 2))
      const weekend = (d >= 5 ? 1.25 : 1.0)
      const phase = 1 + 0.03 * Math.sin((weekOffset * 7 + d + s / 48) * 0.9)
      let demand = Math.round(base * phase * (0.25 + 1.2 * (0.7 * lunch + 1.0 * dinner)) * weekend)
      const startHour = d <= 4 ? 8 : 10

      let baselineMultiplier = ["Server", "Cook", "Bartender"].includes(role) ? 1.2 : 1.05
      const hourFromOpen = hour - startHour
      if (hourFromOpen < 1 || hourFromOpen >= 12) baselineMultiplier = 1.0
      else if (hourFromOpen >= 2 && hourFromOpen < 4) baselineMultiplier = 1.15
      else if (hourFromOpen >= 4 && hourFromOpen < 6) baselineMultiplier = 0.9
      else if (hourFromOpen >= 6 && hourFromOpen < 8) baselineMultiplier = 1.05
      else if (hourFromOpen >= 8 && hourFromOpen < 10) baselineMultiplier = 0.85
      else if (hourFromOpen >= 10 && hourFromOpen < 11) baselineMultiplier = 1.05

      const variability = 1 + noise(weekOffset + 3, d, s) * 0.08
      const supplyMultiplier = Math.max(0, baselineMultiplier * attrFactor * variability)
      let supply = Math.max(0, Math.round(demand * supplyMultiplier))

      // Apply campaign overlay (extra supply from new hires) when withCampaign is true
      const allowOverlay = withCampaign && (!overlayForRole || overlayForRole === role)
      if (allowOverlay) {
        const dateForSlot = (() => {
          const mon = mondayOf(weekOffset)
          return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + d)
        })()
        // Use isScheduledOn to check if date is within campaign period (ignores liveView state)
        // Also check that there's actual spending configured
        const hasSpend = hasSpendGlobal
        if (hasSpend && isScheduledOn(dateForSlot)) {
          // distribute extra half-hour units evenly across open slots of the day
          const openSlots = Array.from({ length: 48 }, (_, idx) => idx).filter(idx => isOpen(d, Math.floor(idx/2)))
          const extraHalfHoursPerDay = getExtraSupplyHalfHoursPerDay()
          const perSlot = openSlots.length > 0 ? extraHalfHoursPerDay / openSlots.length : 0
          if (perSlot > 0 && openSlots.includes(s)) {
            supply += Math.round(perSlot)
          }
        }
      }

      const override = getOverride(role, weekOffset, d, s)
      if (override) {
        demand = Math.max(0, override.demand)
        supply = Math.max(0, override.supply)
      }

      return { demand, supply, closed: false }
    })
  ))

  if (role === "Server" && weekOffset === 0) {
    const dayIdx = 0
    const injectionSlots: Array<{ slot: number; multiplier: number }> = [
      { slot: 20, multiplier: 0.35 }, // ~ -3 level
      { slot: 22, multiplier: 0.72 }, // ~ -2 level
      { slot: 24, multiplier: 0.88 }, // ~ -1 level
      { slot: 26, multiplier: 1.0 },  //  0 level
      { slot: 28, multiplier: 1.12 }, // +1 level
      { slot: 32, multiplier: 1.25 }, // +2 level
      { slot: 36, multiplier: 1.4 }   // +3 level
    ]

    injectionSlots.forEach(({ slot, multiplier }) => {
      const cell = weekData[dayIdx]?.[slot]
      if (!cell || cell.closed) return
      const demand = Math.max(cell.demand, 6)
      const supply = Math.max(0, Math.round(demand * multiplier))
      weekData[dayIdx][slot] = { demand, supply, closed: false }
    })
  }

  return weekData
}

// Lightweight memoization for week matrices across views
const __weekCache = new Map<string, { data: any, key: string }>()
function getWeekCached(
  role: string,
  weekOffset: number,
  withCampaign: boolean,
  overlayForRole: string | undefined,
  cacheKey: string
) {
  const k = `${cacheKey}|${role}|${weekOffset}|${withCampaign?'1':'0'}|${overlayForRole||'-'}`
  const hit = __weekCache.get(k)
  if (hit && hit.key === k) return hit.data
  const data = genWeek(role, weekOffset, withCampaign, overlayForRole)
  __weekCache.set(k, { data, key: k })
  return data
}

function mondayOf(offsetWeeks = 0) {
  const now = new Date()
  const day = (now.getDay() + 6) % 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - day + offsetWeeks * 7)
  mon.setHours(0,0,0,0)
  return mon
}

function mondayOfDate(dateObj: Date){
  const d = new Date(dateObj)
  const day = (d.getDay() + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day)
  mon.setHours(0,0,0,0)
  return mon
}

function addDays(date: Date, n: number) { const d = new Date(date); d.setDate(d.getDate() + n); return d }
function fmt(d: Date) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
function fmtMonth(year: number, month: number) { return new Date(year, month).toLocaleString(undefined, { month: 'long', year: 'numeric' }) }
function rollMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

interface CoverageHeatmapProps {
  selectedJobs: string[];
}

export default function CoverageHeatmap({ selectedJobs }: CoverageHeatmapProps) {
  const [viewMode, setViewMode] = useState<'week'|'month'|'year'>('week')
  const [showLegend, setShowLegend] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [showWithCampaign, setShowWithCampaign] = useState(false)
  const overrideVersion = useOverrideVersion()
  const planVersion = useCampaignPlanVersion()

  // Generate week matrix for the selected job
  const selectedJob = selectedJobs.length > 0 ? selectedJobs[0] : null;
  const cacheKey = `${overrideVersion}-${planVersion}`
  const weekMatrix = useMemo(() =>
    selectedJob ? getWeekCached(selectedJob, weekOffset, showWithCampaign, selectedJob, cacheKey) : [],
    [selectedJob, weekOffset, showWithCampaign, cacheKey]
  )
  // Prewarm cache for Year view months in idle chunks to improve toggle responsiveness
  function scheduleIdle(fn: () => void) {
    const anyWin: any = typeof window !== 'undefined' ? window : null
    if (anyWin && typeof anyWin.requestIdleCallback === 'function') {
      anyWin.requestIdleCallback(fn)
    } else {
      setTimeout(fn, 0)
    }
  }
  useEffect(() => {
    if (!selectedJob) return
    let cancelled = false
    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth()
    const months = Array.from({ length: 12 }, (_, m) => m)
    let idx = 0
    const pump = () => {
      if (cancelled) return
      // process a small chunk per idle tick
      for (let i = 0; i < 4 && idx < months.length; i++, idx++) {
        const m = months[idx]
        const monthsFromNow = (currentYear - nowYear) * 12 + (m - nowMonth)
        const weeksFromNow = Math.round(monthsFromNow * 4.33)
        // Prewarm for both before/after to make the toggle snappy
        getWeekCached(selectedJob, weeksFromNow, false, selectedJob, cacheKey)
        getWeekCached(selectedJob, weeksFromNow, true, selectedJob, cacheKey)
      }
      if (idx < months.length) scheduleIdle(pump)
    }
    // Only prewarm when Year view is likely to be used (or always, it is cheap in idle)
    scheduleIdle(pump)
    return () => { cancelled = true }
  }, [selectedJob, currentYear, cacheKey])
  
  const weekStart = useMemo(() => mondayOf(weekOffset), [weekOffset])
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  function goToMonth(year: number, monthIdx: number) {
    setCurrentYear(year)
    setCurrentMonth(monthIdx)
    setViewMode('month')
  }
  
  function goToWeekContaining(dateObj: Date) {
    const targetMon = mondayOfDate(dateObj)
    const baseMon = mondayOf(0)
    const msPerWeek = 7 * 24 * 60 * 60 * 1000
    const diff = Math.round((targetMon.getTime() - baseMon.getTime()) / msPerWeek)
    setWeekOffset(diff)
    setViewMode('week')
  }
  
  function shiftMonth(delta: number) {
    const r = rollMonth(currentYear, currentMonth, delta)
    setCurrentYear(r.year)
    setCurrentMonth(r.month)
  }

  // Show placeholder if no job selected
  if (!selectedJob) {
    return (
      <div className="bg-white border rounded-xl p-4">
        <div className="text-center py-12 text-gray-500">
          Select a job to view coverage heatmap
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base">Coverage</h2>

          {viewMode === 'week' && (
            <div className="flex items-center gap-1 text-sm">
              <button onClick={()=>setWeekOffset(weekOffset-1)} className="border rounded px-2 py-0.5">◀</button>
              <span className="text-gray-600">{fmt(weekStart)} – {fmt(weekEnd)}</span>
              <button onClick={()=>setWeekOffset(weekOffset+1)} className="border rounded px-2 py-0.5">▶</button>
            </div>
          )}
          {viewMode === 'month' && (
            <div className="flex items-center gap-1 text-sm">
              <button onClick={()=>shiftMonth(-1)} className="border rounded px-2 py-0.5">◀</button>
              <span className="text-gray-600">{fmtMonth(currentYear,currentMonth)}</span>
              <button onClick={()=>shiftMonth(1)} className="border rounded px-2 py-0.5">▶</button>
            </div>
          )}
          {viewMode === 'year' && (
            <div className="flex items-center gap-1 text-sm">
              <button onClick={()=>setCurrentYear(y=>y-1)} className="border rounded px-2 py-0.5">◀</button>
              <span className="text-gray-600">{currentYear}</span>
              <button onClick={()=>setCurrentYear(y=>y+1)} className="border rounded px-2 py-0.5">▶</button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2">
            <button onClick={()=>setViewMode('week')} className={`px-2 py-1 border rounded ${viewMode==='week'?'bg-gray-900 text-white':''}`}>Week</button>
            <button onClick={()=>setViewMode('month')} className={`px-2 py-1 border rounded ${viewMode==='month'?'bg-gray-900 text-white':''}`}>Month</button>
            <button onClick={()=>setViewMode('year')} className={`px-2 py-1 border rounded ${viewMode==='year'?'bg-gray-900 text-white':''}`}>Year</button>
            <button onClick={()=>setShowLegend(!showLegend)} className="ml-2 underline">Legend</button>
          </div>
          
          <div className="flex items-center gap-1 ml-4 border-l pl-4">
            <button 
              onClick={()=>setShowWithCampaign(false)} 
              className={`px-3 py-1 border rounded text-sm ${!showWithCampaign?'bg-blue-600 text-white':'bg-white hover:bg-gray-50'}`}
            >
              Before Campaign
            </button>
            <button 
              onClick={()=>setShowWithCampaign(true)} 
              className={`px-3 py-1 border rounded text-sm ${showWithCampaign?'bg-green-600 text-white':'bg-white hover:bg-gray-50'}`}
            >
              After Campaign
            </button>
          </div>
        </div>
      </div>

      {showLegend && (
        <div className="mb-3 p-2 border rounded bg-gray-50 text-xs">
          <div className="mb-2 font-semibold">7 staffing levels (10% increments):</div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 14, selectedJobs[0])}}/>+3: ≥30% oversupply (white)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 12.5, selectedJobs[0])}}/>+2: 20-30% oversupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 11.5, selectedJobs[0])}}/>+1: 10-20% oversupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 10, selectedJobs[0])}}/>0: balanced (base color)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 8.5, selectedJobs[0])}}/>-1: 10-20% undersupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 7.5, selectedJobs[0])}}/>-2: 20-30% undersupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 6.5, selectedJobs[0])}}/>-3: ≥30% undersupply (black)</span>
            <span className="inline-flex items-center gap-1 text-gray-500"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.closed}}/>closed</span>
          </div>
          <div className="mt-2 text-gray-600">Numbers in cells show staffing level (-3 to +3).</div>
        </div>
      )}

      <div className="overflow-auto max-h-[400px]">
        {viewMode === 'week' && (
          <WeekGrid weekMatrix={weekMatrix} jobRole={selectedJob} weekStart={weekStart} />
        )}
        {viewMode === 'month' && (
          <MonthGrid
            jobRole={selectedJob}
            year={currentYear}
            month={currentMonth}
            withCampaign={showWithCampaign}
            cacheKey={cacheKey}
            onDayClick={(dateObj: Date)=>goToWeekContaining(dateObj)}
          />
        )}
        {viewMode === 'year' && (
          <YearGridDays
            jobRole={selectedJob}
            year={currentYear}
            withCampaign={showWithCampaign}
            cacheKey={cacheKey}
            onMonthClick={(monthIdx: number)=>goToMonth(currentYear, monthIdx)}
            onDayClick={(dateObj: Date)=>goToWeekContaining(dateObj)}
          />
        )}
      </div>
    </div>
  )
}

function WeekGrid({ weekMatrix, jobRole, weekStart }: { weekMatrix: { demand: number; supply: number; closed: boolean }[][], jobRole: string, weekStart: Date }) {
  const startSlot = DISPLAY_START_HOUR * 2
  const endSlot = DISPLAY_END_HOUR * 2
  const slotIndices = Array.from({ length: endSlot - startSlot }, (_, i) => startSlot + i)

  return (
    <div className="min-w-[720px]">
      <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, 1fr)`, columnGap: '2px' }}>
        <div className="text-[10px] text-gray-500 p-1"></div>
        {DAYS.map((d, dayIdx) => {
          const dateObj = addDays(weekStart, dayIdx)
          const monthLabel = dateObj.toLocaleString(undefined, { month: 'short' }).replace('.', '').toUpperCase()
          const dayLabel = dateObj.getDate().toString().padStart(2, '0')
          const dateLabel = `${monthLabel}${dayLabel}`
          return (
            <div key={d} className="text-[11px] font-medium text-center p-1 sticky top-0 bg-white border-b">
              <div>{d}</div>
              <div className="text-[9px] text-slate-400 mt-[2px]">{dateLabel}</div>
            </div>
          )
        })}
      </div>
      <div className="max-h-[520px] overflow-auto">
        {slotIndices.map((slotIdx) => {
          const hour = Math.floor(slotIdx / 2)
          const minutes = slotIdx % 2 === 0 ? "00" : "30"
          const isFullHour = minutes === "00"
          const showLabel = isFullHour
          const hourLabel = `${hour.toString().padStart(2,'0')}:${minutes}`
          return (
            <div key={slotIdx}>
              <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, 1fr)`, columnGap: '2px' }}>
                <div className="relative h-[18px] sticky left-0 bg-white">
                  {showLabel && (
                    <span className="absolute -translate-y-2 text-[9px] leading-none text-gray-500">{hourLabel}</span>
                  )}
                </div>
                {/* For each day column */}
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                  const slot = weekMatrix[dayIdx]?.[slotIdx]
                  const closed = !slot || slot.closed
                  const demand = slot?.demand ?? 0
                  const supply = slot?.supply ?? 0
                  const bg = closed ? COLORS.closed : cellColor(demand, supply, jobRole)
                  const delta = closed ? "" : getDeltaDisplay(demand, supply)
                  const isUndersupply = !closed && (supply - demand) < 0
                  
                  return (
                    <div
                      key={dayIdx}
                      title={`${jobRole}: D:${demand} S:${supply}${closed?' (closed)':''}`}
                      style={{ background: bg }}
                      className="flex h-[18px] items-center justify-center text-[9px] font-medium"
                    >
                      <span className={isUndersupply ? "text-white" : "text-gray-900"}>{delta}</span>
                    </div>
                  )
                })}
              </div>
              <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, 1fr)`, columnGap: '2px' }}>
                <div style={{ height: '2px', background: '#f1f5f9' }} />
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} style={{ height: '2px', background: '#f1f5f9' }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Classify supply/demand delta into 7 divisions (-3 to +3)
function getDivision(demand: number, supply: number): number {
  if (demand <= 0) return -99 // closed/no demand (special value)
  const delta = (supply - demand) / demand
  
  // 7 divisions: -3, -2, -1, 0, +1, +2, +3
  if (delta <= -0.30) return -3  // -30% or worse → black
  if (delta <= -0.20) return -2  // -20% to -30%
  if (delta <= -0.10) return -1  // -10% to -20%
  if (delta >= 0.30) return 3    // +30% or more → white
  if (delta >= 0.20) return 2    // +20% to +30%
  if (delta >= 0.10) return 1    // +10% to +20%
  return 0                        // -10% to +10% (balanced)
}

function MonthGrid(
  { jobRole, year, month, withCampaign, cacheKey, onDayClick }:
  { jobRole: string, year: number, month: number, withCampaign: boolean, cacheKey: string, onDayClick?: (d: Date)=>void }
) {
  const cellHeight = 64
  const divColors = useMemo(() => paletteForRole(jobRole), [jobRole])

  const first = new Date(year, month, 1)
  
  // Calculate week offset for this month relative to current month
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const monthsFromNow = (year - currentYear) * 12 + (month - currentMonth)
  const weeksFromNow = Math.round(monthsFromNow * 4.33) // ~4.33 weeks per month
  
  // Generate data for this specific month and calculate distribution
  const monthMatrix = getWeekCached(jobRole, weeksFromNow, withCampaign, jobRole, cacheKey) as Slot[][]
  const divisionsByWeekday = monthMatrix.map((daySlots: Slot[]) => {
    const counts = Array(7).fill(0) as number[] // 7 divisions (-3 to +3)
    for (const { demand, supply, closed } of daySlots as Slot[]) {
      if (!closed) {
        const div = getDivision(demand, supply)
        if (div >= -3 && div <= 3) {
          counts[div + 3]++ // Map -3 to index 0, 0 to index 3, +3 to index 6
        }
      }
    }
    return counts
  })
  
  const lastDay = new Date(year, month + 1, 0).getDate()
  const firstWeekdayJS = first.getDay()
  const firstWeekdayMon0 = (firstWeekdayJS + 6) % 7
  
  const cells = Array.from({ length: 42 }, (_, idx) => {
    const dayNum = idx - firstWeekdayMon0 + 1
    if (dayNum < 1 || dayNum > lastDay) return { label: "", type: 'empty' as const }
    const dt = new Date(year, month, dayNum)
    const jsDay = dt.getDay()
    const weekday = (jsDay + 6) % 7
    
    // Build data for this day
    const counts = divisionsByWeekday[weekday]
    const total = counts.reduce((a: number, b: number) => a + b, 0)
    
    if (total === 0) return { label: String(dayNum), type: 'closed' as const, dateObj: dt }
    
    const percentages = counts.map((c: number) => total > 0 ? (c / total) * 100 : 0)
    return { label: String(dayNum), type: 'divisions' as const, percentages, dateObj: dt }
  })

  return (
    <div className="grid gap-2 p-2" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
      {DAYS.map(d => (
        <div key={d} className="text-xs font-medium text-center text-gray-600">{d}</div>
      ))}
      {cells.map((c, i) => (
        <div key={i} className="border rounded p-1 flex flex-col cursor-pointer" style={{ height: `${cellHeight}px` }} onClick={() => c.dateObj && onDayClick && onDayClick(c.dateObj)}>
          <div className="text-[10px] text-gray-500 mb-1">{c.label}</div>
          {c.type === 'empty' && <div className="flex-1 rounded bg-gray-100" />}
          {c.type === 'closed' && <div className="flex-1 rounded" style={{ background: COLORS.closed }} />}
          {c.type === 'divisions' && (
            <div className="flex-1 rounded overflow-hidden flex">
              {c.percentages.map((pct: number, divIdx: number) => {
                if (pct <= 0) return null
                return <div key={divIdx} style={{ width: `${pct}%`, background: divColors[divIdx] }} />
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function YearGridDays(
  { jobRole, year, withCampaign, cacheKey, onMonthClick, onDayClick }:
  { jobRole: string, year?: number, withCampaign: boolean, cacheKey: string, onMonthClick?: (m: number)=>void, onDayClick?: (d: Date)=>void }
) {
  const cellHeight = 10
  const monthHeight = 154
  const divColors = useMemo(() => paletteForRole(jobRole), [jobRole])

  const yr = year || new Date().getFullYear()

  return (
    <div className="grid gap-3 p-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {Array.from({ length: 12 }, (_, m) => {
        return (
          <MonthMiniCard
            key={m}
            year={yr}
            monthIndex={m}
            jobRole={jobRole}
            withCampaign={withCampaign}
            cacheKey={cacheKey}
            cellHeight={cellHeight}
            monthHeight={monthHeight}
            divColors={divColors}
            onMonthClick={onMonthClick}
            onDayClick={onDayClick}
          />
        )
      })}
    </div>
  )
}

function MonthMiniCard({
  year,
  monthIndex,
  jobRole,
  withCampaign,
  cacheKey,
  cellHeight,
  monthHeight,
  divColors,
  onMonthClick,
  onDayClick,
}: {
  year: number
  monthIndex: number
  jobRole: string
  withCampaign: boolean
  cacheKey: string
  cellHeight: number
  monthHeight: number
  divColors: string[]
  onMonthClick?: (m: number)=>void
  onDayClick?: (d: Date)=>void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // Defer to next frame to batch visibilities from multiple months
            requestAnimationFrame(() => setVisible(true))
          }
        }
      },
      { root: el.parentElement?.parentElement || null, rootMargin: '200px 0px', threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const first = useMemo(() => new Date(year, monthIndex, 1), [year, monthIndex])

  // Compute heavy month data only once visible
  const cells = useMemo(() => {
    if (!visible) return null as null | Array<{ type: 'empty'|'closed'|'divisions'; dateObj: Date|null; percentages?: number[] }>
    const lastDay = new Date(year, monthIndex + 1, 0).getDate()
    const firstWeekdayJS = first.getDay()
    const firstWeekdayMon0 = (firstWeekdayJS + 6) % 7
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const monthsFromNow = (year - currentYear) * 12 + (monthIndex - currentMonth)
    const weeksFromNow = Math.round(monthsFromNow * 4.33)
    const monthMatrix = getWeekCached(jobRole, weeksFromNow, withCampaign, jobRole, cacheKey) as Slot[][]
    const divisionsByWeekday = monthMatrix.map((daySlots: Slot[]) => {
      const counts = Array(7).fill(0) as number[]
      for (const { demand, supply, closed } of daySlots as Slot[]) {
        if (!closed) {
          const div = getDivision(demand, supply)
          if (div >= -3 && div <= 3) counts[div + 3]++
        }
      }
      return counts
    })
    return Array.from({ length: 42 }, (_, idx) => {
      const dayNum = idx - firstWeekdayMon0 + 1
      if (dayNum < 1 || dayNum > lastDay) return { type: 'empty' as const, dateObj: null }
      const dt = new Date(year, monthIndex, dayNum)
      const jsDay = dt.getDay()
      const weekday = (jsDay + 6) % 7
      const counts = divisionsByWeekday[weekday]
      const total = counts.reduce((a: number, b: number) => a + b, 0)
      if (total === 0) return { type: 'closed' as const, dateObj: dt }
      const percentages = counts.map((c: number) => total > 0 ? (c / total) * 100 : 0)
      return { type: 'divisions' as const, dateObj: dt, percentages }
    })
  }, [visible, year, monthIndex, first, jobRole, withCampaign, cacheKey])

  return (
    <div ref={ref} className="border rounded p-2 flex flex-col" style={{ height: `${monthHeight}px` }}>
      <div className="text-xs font-medium text-gray-700 mb-1 cursor-pointer" onClick={() => onMonthClick && onMonthClick(monthIndex)}>
        {first.toLocaleString(undefined, { month: 'short' })}
      </div>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAYS.map((d, idx) => (
          <div key={`h-${monthIndex}-${idx}`} className="text-[9px] text-gray-400 text-center">{d[0]}</div>
        ))}
        {cells ? cells.map((c, idx) => (
          <div
            key={idx}
            style={{ height: `${cellHeight + 6}px` }}
            className={c.dateObj ? "cursor-pointer" : ""}
            onClick={() => c.dateObj && onDayClick && onDayClick(c.dateObj)}
          >
            {c.type === 'empty' && <div className="w-full rounded bg-gray-100" style={{ height: `${cellHeight}px` }} />}
            {c.type === 'closed' && <div className="w-full rounded" style={{ height: `${cellHeight}px`, background: COLORS.closed }} />}
            {c.type === 'divisions' && (
              <div className="w-full rounded overflow-hidden flex" style={{ height: `${cellHeight}px` }}>
                {c.percentages!.map((pct: number, divIdx: number) => {
                  if (pct <= 0) return null
                  return <div key={divIdx} style={{ width: `${pct}%`, background: divColors[divIdx] }} />
                })}
              </div>
            )}
          </div>
        )) : (
          // Placeholder while offscreen
          Array.from({ length: 42 }).map((_, idx) => (
            <div key={idx} style={{ height: `${cellHeight + 6}px` }}>
              <div className="w-full rounded bg-gray-100" style={{ height: `${cellHeight}px` }} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

