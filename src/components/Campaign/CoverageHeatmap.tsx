import { useMemo, useState } from "react"

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? "00" : "30"
  return `${h.toString().padStart(2,'0')}:${m}`
})

// Base colors for each job role (exact colors from user specification)
const JOB_BASE_COLORS: Record<string, string> = {
  "Server": "#D72A4D",       // Red
  "Cook": "#FB8331",         // Orange
  "Bartender": "#FFCB03",    // Yellow
  "Security": "#21BF6B",     // Green
  "Dishwasher": "#12B9B1",   // Teal
  "Manager": "#2E98DB",      // Light Blue
  "Cleaner": "#3967D6",      // Dark Blue
  "Barista": "#8855D0"       // Purple
}

const COLORS = {
  closed: "#e5e7eb"
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
  if (dayIdx <= 4) return hour >= 9 && hour < 21
  return hour >= 10 && hour < 22
}

function noise(seed: number, d: number, s: number) {
  const x = Math.sin((seed + 1) * 9301 + d * 49297 + s * 233280) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

// Box-Muller transform to generate normally distributed random numbers
function normalRandom(seed: number, d: number, s: number, mean: number = 0, stdDev: number = 1.5): number {
  // Generate two uniform random numbers using different seeds
  const x1 = Math.sin((seed + 1) * 9301 + d * 49297 + s * 233280) * 43758.5453
  const u1 = x1 - Math.floor(x1)
  const x2 = Math.sin((seed + 2) * 9301 + d * 49297 + (s + 1) * 233280) * 43758.5453
  const u2 = x2 - Math.floor(x2)
  
  // Box-Muller transform
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
  return mean + z0 * stdDev
}

function genWeek(role: string, weekOffset = 0) {
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
  
  // Decay factor: 10% workforce quits per month = ~2.5% per week
  // Negative weekOffset = past (better staffed), Positive = future (understaffed)
  const decayRate = 0.025 // 2.5% per week
  const decayFactor = 1 - (weekOffset * decayRate)
  
  // Current month bonus: Add extra capacity for current month (weeks -2 to +2)
  const isCurrentMonth = weekOffset >= -2 && weekOffset <= 2
  const currentMonthBonus = isCurrentMonth ? 1.5 : 0 // Extra 1-2 employees per shift
  
  return Array.from({ length: 7 }, (_, d) => (
    Array.from({ length: 48 }, (_, s) => {
      const hour = Math.floor(s / 2)
      const open = isOpen(d, hour)
      if (!open) return { demand: 0, supply: 0, closed: true }
      const lunch = Math.exp(-Math.pow((hour - 12) / 2, 2))
      const dinner = Math.exp(-Math.pow((hour - 19) / 2, 2))
      const weekend = (d >= 5 ? 1.25 : 1.0)
      const phase = 1 + 0.03 * Math.sin((weekOffset * 7 + d + s / 48) * 0.9)
      const demand = Math.round(base * phase * (0.25 + 1.2 * (0.7 * lunch + 1.0 * dinner)) * weekend)
      
      // Generate supply using normal distribution
      // Mean = 0 (balanced), StdDev = 1.5 gives good spread across -3 to +3
      // This creates a bell curve centered at balanced staffing
      const normalValue = normalRandom(weekOffset, d, s, 0, 1.5)
      
      // Convert normal value to percentage delta
      // -3σ to +3σ maps roughly to -30% to +30%
      const percentDelta = normalValue * 0.10 // Each unit is 10%
      
      // Calculate base supply with normal distribution
      let supply = demand * (1 + percentDelta)
      
      // Apply decay factor (workforce attrition over time)
      supply = supply * decayFactor
      
      // Add current month bonus (extra capacity)
      supply = supply + currentMonthBonus
      
      // Round and ensure non-negative
      supply = Math.max(0, Math.round(supply))
      
      return { demand, supply, closed: false }
    })
  ))
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

  // Generate week matrices for all selected jobs
  const weekMatrices = useMemo(() => 
    selectedJobs.map(job => ({ job, matrix: genWeek(job, weekOffset) })),
    [selectedJobs, weekOffset]
  )
  
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

  // Show placeholder if no jobs selected
  if (selectedJobs.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-4">
        <div className="text-center py-12 text-gray-500">
          Select one or more jobs to view coverage heatmap
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base">Coverage Heatmap</h2>
          
          {/* Show selected jobs with their colors */}
          <div className="flex items-center gap-2">
            {selectedJobs.map(job => (
              <div key={job} className="flex items-center gap-1 text-xs">
                <div className="w-3 h-3 rounded" style={{ background: JOB_BASE_COLORS[job] || '#3498DB' }} />
                <span>{job}</span>
              </div>
            ))}
          </div>

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
          <button onClick={()=>setViewMode('week')} className={`px-2 py-1 border rounded ${viewMode==='week'?'bg-gray-900 text-white':''}`}>Week</button>
          <button onClick={()=>setViewMode('month')} className={`px-2 py-1 border rounded ${viewMode==='month'?'bg-gray-900 text-white':''}`}>Month</button>
          <button onClick={()=>setViewMode('year')} className={`px-2 py-1 border rounded ${viewMode==='year'?'bg-gray-900 text-white':''}`}>Year</button>
          <button onClick={()=>setShowLegend(!showLegend)} className="ml-2 underline">Legend</button>
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
          <div className="mt-2 text-gray-600">Numbers in cells show staffing level. When multiple jobs selected, cells subdivide laterally.</div>
        </div>
      )}

      <div className="overflow-auto max-h-[400px]">
        {viewMode === 'week' && (
          <WeekGrid weekMatrices={weekMatrices} />
        )}
        {viewMode === 'month' && (
          <MonthGrid
            weekMatrices={weekMatrices}
            year={currentYear}
            month={currentMonth}
            onDayClick={(dateObj: Date)=>goToWeekContaining(dateObj)}
          />
        )}
        {viewMode === 'year' && (
          <YearGridDays
            weekMatrices={weekMatrices}
            year={currentYear}
            onMonthClick={(monthIdx: number)=>goToMonth(currentYear, monthIdx)}
          />
        )}
      </div>
    </div>
  )
}

function WeekGrid({ weekMatrices }: { weekMatrices: { job: string, matrix: { demand: number; supply: number; closed: boolean }[][] }[] }) {
  const jobCount = weekMatrices.length
  
  return (
    <div className="min-w-[720px]">
      <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, 1fr)`, columnGap: '2px' }}>
        <div className="text-[10px] text-gray-500 p-1"></div>
        {DAYS.map(d => (
          <div key={d} className="text-[11px] font-medium text-center p-1 sticky top-0 bg-white border-b">{d}</div>
        ))}
      </div>
      <div className="max-h-[520px] overflow-auto">
        {HALF_HOUR_SLOTS.map((t, rowIdx) => {
          const hour = Math.floor(rowIdx / 2)
          const isFullHour = rowIdx % 2 === 0
          const showLabel = isFullHour && (hour % 2 === 0)
          const hourLabel = `${hour.toString().padStart(2,'0')}:00`
          return (
            <div key={t}>
              <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, 1fr)`, columnGap: '2px' }}>
                <div className="relative h-[18px] sticky left-0 bg-white">
                  {showLabel && (
                    <span className="absolute -translate-y-2 text-[9px] leading-none text-gray-500">{hourLabel}</span>
                  )}
                </div>
                {/* For each day column */}
                {Array.from({ length: 7 }).map((_, dayIdx) => (
                  <div key={dayIdx} className="flex h-[18px]">
                    {/* Subdivide laterally for each job */}
                    {weekMatrices.map(({ job, matrix }) => {
                      const { demand, supply, closed } = matrix[dayIdx][rowIdx]
                      const bg = closed ? COLORS.closed : cellColor(demand, supply, job)
                      const delta = getDeltaDisplay(demand, supply)
                      const isUndersupply = !closed && (supply - demand) < 0
                      
                      return (
                        <div
                          key={job}
                          title={`${job}: D:${demand} S:${supply}${closed?' (closed)':''}`}
                          style={{ background: bg, width: `${100 / jobCount}%` }}
                          className="flex items-center justify-center text-[9px] font-medium"
                        >
                          <span className={isUndersupply ? "text-white" : "text-gray-900"}>{delta}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
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
  { weekMatrices, year, month, onDayClick }:
  { weekMatrices: { job: string, matrix: { demand: number; supply: number; closed: boolean }[][] }[], year: number, month: number, onDayClick?: (d: Date)=>void }
) {
  const jobCount = weekMatrices.length
  const cellHeight = jobCount === 1 ? 64 : 32 * jobCount // Scale height based on job count

  // For each job, calculate distribution across 7 divisions for each weekday
  const jobsData = weekMatrices.map(({ job, matrix }) => {
    const divisionsByWeekday = matrix.map(daySlots => {
      const counts = Array(7).fill(0) // 7 divisions (-3 to +3)
      for (const { demand, supply, closed } of daySlots) {
        if (!closed) {
          const div = getDivision(demand, supply)
          if (div >= -3 && div <= 3) {
            counts[div + 3]++ // Map -3 to index 0, 0 to index 3, +3 to index 6
          }
        }
      }
      return counts
    })
    return { job, divisionsByWeekday }
  })

  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const firstWeekdayJS = first.getDay()
  const firstWeekdayMon0 = (firstWeekdayJS + 6) % 7
  
  const cells = Array.from({ length: 42 }, (_, idx) => {
    const dayNum = idx - firstWeekdayMon0 + 1
    if (dayNum < 1 || dayNum > lastDay) return { label: "", type: 'empty' as const }
    const dt = new Date(year, month, dayNum)
    const jsDay = dt.getDay()
    const weekday = (jsDay + 6) % 7
    
    // Build data for each job for this day
    const jobsPercentages = jobsData.map(({ job, divisionsByWeekday }) => {
      const counts = divisionsByWeekday[weekday]
      const total = counts.reduce((a, b) => a + b, 0)
      if (total === 0) return { job, percentages: null }
      const percentages = counts.map(c => total > 0 ? (c / total) * 100 : 0)
      return { job, percentages }
    })
    
    const allClosed = jobsPercentages.every(jp => jp.percentages === null)
    if (allClosed) return { label: String(dayNum), type: 'closed' as const, dateObj: dt }
    
    return { label: String(dayNum), type: 'divisions' as const, jobsPercentages, dateObj: dt }
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
            <div className="flex-1 flex flex-col gap-[2px]">
              {c.jobsPercentages.map(({ job, percentages }) => {
                if (!percentages) return <div key={job} className="flex-1 rounded" style={{ background: COLORS.closed }} />
                return (
                  <div key={job} className="flex-1 rounded overflow-hidden flex">
                    {percentages.map((pct, divIdx) => {
                      if (pct <= 0) return null
                      const mockDemand = 10
                      const mockSupply = divIdx === 0 ? 6.5 : divIdx === 1 ? 7.5 : divIdx === 2 ? 8.5 : divIdx === 3 ? 10 : divIdx === 4 ? 11.5 : divIdx === 5 ? 12.5 : 14
                      const color = cellColor(mockDemand, mockSupply, job)
                      return <div key={divIdx} style={{ width: `${pct}%`, background: color }} />
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function YearGridDays(
  { weekMatrices, year, onMonthClick }:
  { weekMatrices: { job: string, matrix: { demand: number; supply: number; closed: boolean }[][] }[], year?: number, onMonthClick?: (m: number)=>void }
) {
  const jobCount = weekMatrices.length
  const cellHeight = jobCount === 1 ? 10 : 6 * jobCount // Scale height based on job count
  const monthHeight = jobCount === 1 ? 154 : 100 + (jobCount * 15) // Scale month card height

  // For each job, calculate distribution across 7 divisions for each weekday
  const jobsData = weekMatrices.map(({ job, matrix }) => {
    const divisionsByWeekday = matrix.map(daySlots => {
      const counts = Array(7).fill(0) // 7 divisions (-3 to +3)
      for (const { demand, supply, closed } of daySlots) {
        if (!closed) {
          const div = getDivision(demand, supply)
          if (div >= -3 && div <= 3) {
            counts[div + 3]++ // Map -3 to index 0, 0 to index 3, +3 to index 6
          }
        }
      }
      return counts
    })
    return { job, divisionsByWeekday }
  })

  const yr = year || new Date().getFullYear()

  return (
    <div className="grid gap-3 p-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(yr, m, 1)
        const lastDay = new Date(yr, m + 1, 0).getDate()
        const firstWeekdayJS = first.getDay()
        const firstWeekdayMon0 = (firstWeekdayJS + 6) % 7

        const cells = Array.from({ length: 42 }, (_, idx) => {
          const dayNum = idx - firstWeekdayMon0 + 1
          if (dayNum < 1 || dayNum > lastDay) return { type: 'empty' as const }
          const dt = new Date(yr, m, dayNum)
          const jsDay = dt.getDay()
          const weekday = (jsDay + 6) % 7
          
          // Build data for each job for this day
          const jobsPercentages = jobsData.map(({ job, divisionsByWeekday }) => {
            const counts = divisionsByWeekday[weekday]
            const total = counts.reduce((a, b) => a + b, 0)
            if (total === 0) return { job, percentages: null }
            const percentages = counts.map(c => total > 0 ? (c / total) * 100 : 0)
            return { job, percentages }
          })
          
          const allClosed = jobsPercentages.every(jp => jp.percentages === null)
          if (allClosed) return { type: 'closed' as const }
          
          return { type: 'divisions' as const, jobsPercentages }
        })

        return (
          <div key={m} className="border rounded p-2 flex flex-col" style={{ height: `${monthHeight}px` }}>
            <div className="text-xs font-medium text-gray-700 mb-1 cursor-pointer" onClick={() => onMonthClick && onMonthClick(m)}>
              {first.toLocaleString(undefined, { month: 'short' })}
            </div>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {DAYS.map((d, idx) => (
                <div key={`h-${m}-${idx}`} className="text-[9px] text-gray-400 text-center">{d[0]}</div>
              ))}
              {cells.map((c, idx) => (
                <div key={idx} style={{ height: `${cellHeight + 6}px` }}>
                  {c.type === 'empty' && <div className="w-full rounded bg-gray-100" style={{ height: `${cellHeight}px` }} />}
                  {c.type === 'closed' && <div className="w-full rounded" style={{ height: `${cellHeight}px`, background: COLORS.closed }} />}
                  {c.type === 'divisions' && (
                    <div className="w-full rounded overflow-hidden flex flex-col gap-[1px]" style={{ height: `${cellHeight}px` }}>
                      {c.jobsPercentages.map(({ job, percentages }) => {
                        if (!percentages) return <div key={job} className="flex-1 rounded" style={{ background: COLORS.closed }} />
                        return (
                          <div key={job} className="flex-1 rounded overflow-hidden flex">
                            {percentages.map((pct, divIdx) => {
                              if (pct <= 0) return null
                              const mockDemand = 10
                              const mockSupply = divIdx === 0 ? 6.5 : divIdx === 1 ? 7.5 : divIdx === 2 ? 8.5 : divIdx === 3 ? 10 : divIdx === 4 ? 11.5 : divIdx === 5 ? 12.5 : 14
                              const color = cellColor(mockDemand, mockSupply, job)
                              return <div key={divIdx} style={{ width: `${pct}%`, background: color }} />
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

