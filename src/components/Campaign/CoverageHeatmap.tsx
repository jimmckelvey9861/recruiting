import { useMemo, useState } from "react"

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? "00" : "30"
  return `${h.toString().padStart(2,'0')}:${m}`
})

// Base colors for each job role (from provided palette)
const JOB_BASE_COLORS: Record<string, string> = {
  "Server": "#E74C3C",      // Red/Pink
  "Cook": "#E67E22",        // Orange
  "Bartender": "#F39C12",   // Yellow
  "Security": "#27AE60",    // Green
  "Dishwasher": "#16A085",  // Teal
  "Manager": "#3498DB",     // Blue
  "Cleaner": "#2C3E50",     // Indigo
  "Barista": "#9B59B6"      // Purple
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
// For oversupply: add white tint (20% per 10% oversupply)
// For undersupply: add black tint (20% per 10% undersupply)
// 50%+ oversupply = completely white
// 50%+ undersupply = completely black
function cellColor(demand: number, supply: number, role: string): string {
  if (demand <= 0 && supply <= 0) return COLORS.closed
  
  const baseColor = JOB_BASE_COLORS[role] || "#3498DB"
  const rgb = hexToRgb(baseColor)
  
  // Calculate delta as a percentage
  const delta = (supply - demand) / Math.max(1, demand)
  
  // Clamp delta to +/- 50%
  const clampedDelta = Math.max(-0.5, Math.min(0.5, delta))
  
  if (clampedDelta >= 0) {
    // Oversupply: blend towards white
    // 50% oversupply = 100% white, 0% = base color
    const whiteBlend = clampedDelta * 2 // 0 to 1
    const r = rgb.r + (255 - rgb.r) * whiteBlend
    const g = rgb.g + (255 - rgb.g) * whiteBlend
    const b = rgb.b + (255 - rgb.b) * whiteBlend
    return rgbToHex(r, g, b)
  } else {
    // Undersupply: blend towards black
    // -50% undersupply = 100% black, 0% = base color
    const blackBlend = Math.abs(clampedDelta) * 2 // 0 to 1
    const r = rgb.r * (1 - blackBlend)
    const g = rgb.g * (1 - blackBlend)
    const b = rgb.b * (1 - blackBlend)
    return rgbToHex(r, g, b)
  }
}

// Calculate the delta number to display in cell
function getDeltaDisplay(demand: number, supply: number): string {
  if (demand <= 0) return ""
  const delta = supply - demand
  if (delta === 0) return ""
  return delta > 0 ? `+${delta}` : `${delta}`
}

function isOpen(dayIdx: number, hour: number) {
  if (dayIdx <= 4) return hour >= 9 && hour < 21
  return hour >= 10 && hour < 22
}

function noise(seed: number, d: number, s: number) {
  const x = Math.sin((seed + 1) * 9301 + d * 49297 + s * 233280) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
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
  
  // Supply variance patterns for each role (wider range for better visualization)
  const supplyVarianceMap: Record<string, number> = {
    "Server": 0.75,      // Heavy undersupply
    "Cook": 0.85,        // Moderate undersupply
    "Bartender": 1.20,   // Moderate oversupply
    "Security": 1.40,    // Heavy oversupply
    "Dishwasher": 0.95,  // Slight undersupply
    "Manager": 1.05,     // Slight oversupply
    "Cleaner": 0.60,     // Very heavy undersupply
    "Barista": 1.50      // Very heavy oversupply
  }
  
  const base = baseMap[role] || 5
  const supplyBase = supplyVarianceMap[role] || 1.0
  
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
      
      // Generate supply with variance and some noise for realistic patterns
      const targetSupply = demand * supplyBase
      const noiseVal = noise(weekOffset, d, s) * 1.5 // Added noise for variance
      const supply = Math.max(0, Math.round(targetSupply + noiseVal))
      
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
  availableJobs: string[];
}

export default function CoverageHeatmap({ availableJobs }: CoverageHeatmapProps) {
  // Default to first available job, or if none, default to "Server"
  const defaultRole = availableJobs.length > 0 ? availableJobs[0] : "Server"
  const [selectedRole, setSelectedRole] = useState(defaultRole)
  const [viewMode, setViewMode] = useState<'week'|'month'|'year'>('week')
  const [showLegend, setShowLegend] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())

  const weekMatrix = useMemo(() => genWeek(selectedRole, weekOffset), [selectedRole, weekOffset])
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

  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base">Coverage Heatmap</h2>
          
          {/* Compact Job Selector */}
          <select 
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-white"
          >
            {availableJobs.map(job => (
              <option key={job} value={job}>{job}</option>
            ))}
          </select>

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
          <div className="mb-2 font-semibold">Color indicates supply relative to demand:</div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:"#FFFFFF", border:"1px solid #ccc"}}/>50%+ oversupply (white)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 13, selectedRole)}}/>30% oversupply (lighter)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 11, selectedRole)}}/>10% oversupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 10, selectedRole)}}/>balanced (base color)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 9, selectedRole)}}/>10% undersupply</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:cellColor(10, 7, selectedRole)}}/>30% undersupply (darker)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:"#000000"}}/>50%+ undersupply (black)</span>
            <span className="inline-flex items-center gap-1 text-gray-500"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.closed}}/>closed / no demand</span>
          </div>
          <div className="mt-2 text-gray-600">Numbers in cells show the difference: +N (oversupply) or -N (undersupply)</div>
        </div>
      )}

      <div className="overflow-auto max-h-[400px]">
        {viewMode === 'week' && (
          <WeekGrid weekMatrix={weekMatrix} role={selectedRole} />
        )}
        {viewMode === 'month' && (
          <MonthGrid
            weekMatrix={weekMatrix}
            role={selectedRole}
            year={currentYear}
            month={currentMonth}
            onDayClick={(dateObj: Date)=>goToWeekContaining(dateObj)}
          />
        )}
        {viewMode === 'year' && (
          <YearGridDays
            weekMatrix={weekMatrix}
            role={selectedRole}
            year={currentYear}
            onMonthClick={(monthIdx: number)=>goToMonth(currentYear, monthIdx)}
          />
        )}
      </div>
    </div>
  )
}

function WeekGrid({ weekMatrix, role }: { weekMatrix: { demand: number; supply: number; closed: boolean }[][], role: string }) {
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
                {weekMatrix.map((daySlots, dayIdx) => {
                  const { demand, supply, closed } = daySlots[rowIdx]
                  const bg = closed ? COLORS.closed : cellColor(demand, supply, role)
                  const delta = getDeltaDisplay(demand, supply)
                  // White text for undersupply (shades/darker), black text for oversupply (tints/lighter)
                  const isUndersupply = !closed && (supply - demand) < 0
                  return (
                    <div
                      key={`${dayIdx}-${rowIdx}`}
                      title={`D:${demand} S:${supply}${closed?' (closed)':''}`}
                      style={{ height: '18px', background: bg }}
                      className="flex items-center justify-center text-[9px] font-medium"
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

// Classify supply/demand delta into 11 divisions from black to white
function getDivision(demand: number, supply: number): number {
  if (demand <= 0) return -1 // closed/no demand
  const delta = (supply - demand) / demand
  
  // 11 divisions (0-10) from black to white
  if (delta <= -0.40) return 0  // -40% or worse (black)
  if (delta <= -0.30) return 1  // -30% to -40%
  if (delta <= -0.20) return 2  // -20% to -30%
  if (delta <= -0.10) return 3  // -10% to -20%
  if (delta <= -0.05) return 4  // -5% to -10%
  if (delta <= 0.05) return 5   // -5% to +5% (balanced)
  if (delta <= 0.10) return 6   // +5% to +10%
  if (delta <= 0.20) return 7   // +10% to +20%
  if (delta <= 0.30) return 8   // +20% to +30%
  if (delta <= 0.40) return 9   // +30% to +40%
  return 10                      // +40% or more (white)
}

function MonthGrid(
  { weekMatrix, role, year, month, onDayClick }:
  { weekMatrix: { demand: number; supply: number; closed: boolean }[][], role: string, year: number, month: number, onDayClick?: (d: Date)=>void }
) {
  // Count distribution across 11 divisions for each weekday
  const divisionsByWeekday = weekMatrix.map(daySlots => {
    const counts = Array(11).fill(0) // 11 divisions (0-10)
    for (const { demand, supply, closed } of daySlots) {
      if (!closed) {
        const div = getDivision(demand, supply)
        if (div >= 0 && div <= 10) counts[div]++
      }
    }
    return counts
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
    const counts = divisionsByWeekday[weekday]
    const total = counts.reduce((a, b) => a + b, 0)
    if (total === 0) return { label: String(dayNum), type: 'closed' as const, dateObj: dt }
    
    // Calculate percentage for each division
    const percentages = counts.map(c => total > 0 ? (c / total) * 100 : 0)
    return { label: String(dayNum), type: 'divisions' as const, percentages, dateObj: dt }
  })

  return (
    <div className="grid gap-2 p-2" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
      {DAYS.map(d => (
        <div key={d} className="text-xs font-medium text-center text-gray-600">{d}</div>
      ))}
      {cells.map((c, i) => (
        <div key={i} className="border rounded h-16 p-1 flex flex-col cursor-pointer" onClick={() => c.dateObj && onDayClick && onDayClick(c.dateObj)}>
          <div className="text-[10px] text-gray-500">{c.label}</div>
          {c.type === 'empty' && <div className="flex-1 rounded bg-gray-100" />}
          {c.type === 'closed' && <div className="flex-1 rounded" style={{ background: COLORS.closed }} />}
          {c.type === 'divisions' && (
            <div className="flex-1 rounded overflow-hidden flex">
              {c.percentages.map((pct, divIdx) => {
                if (pct <= 0) return null
                // Generate color for this division (0-10)
                const mockDemand = 10
                const mockSupply = divIdx === 0 ? 5.5 :  // -40% or worse
                                  divIdx === 1 ? 6.5 :   // -30% to -40%
                                  divIdx === 2 ? 7.5 :   // -20% to -30%
                                  divIdx === 3 ? 8.5 :   // -10% to -20%
                                  divIdx === 4 ? 9.5 :   // -5% to -10%
                                  divIdx === 5 ? 10 :    // -5% to +5% (balanced)
                                  divIdx === 6 ? 10.5 :  // +5% to +10%
                                  divIdx === 7 ? 11.5 :  // +10% to +20%
                                  divIdx === 8 ? 12.5 :  // +20% to +30%
                                  divIdx === 9 ? 13.5 :  // +30% to +40%
                                  15                      // +40% or more
                const color = cellColor(mockDemand, mockSupply, role)
                return <div key={divIdx} style={{ width: `${pct}%`, background: color }} />
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function YearGridDays(
  { weekMatrix, role, year, onMonthClick }:
  { weekMatrix: { demand: number; supply: number; closed: boolean }[][], role: string, year?: number, onMonthClick?: (m: number)=>void }
) {
  // Count distribution across 11 divisions for each weekday
  const divisionsByWeekday = weekMatrix.map(daySlots => {
    const counts = Array(11).fill(0) // 11 divisions (0-10)
    for (const { demand, supply, closed } of daySlots) {
      if (!closed) {
        const div = getDivision(demand, supply)
        if (div >= 0 && div <= 10) counts[div]++
      }
    }
    return counts
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
          const counts = divisionsByWeekday[weekday]
          const total = counts.reduce((a, b) => a + b, 0)
          if (total === 0) return { type: 'closed' as const }
          
          // Calculate percentage for each division
          const percentages = counts.map(c => total > 0 ? (c / total) * 100 : 0)
          return { type: 'divisions' as const, percentages }
        })

        return (
          <div key={m} className="border rounded p-2 h-[154px] flex flex-col">
            <div className="text-xs font-medium text-gray-700 mb-1 cursor-pointer" onClick={() => onMonthClick && onMonthClick(m)}>
              {first.toLocaleString(undefined, { month: 'short' })}
            </div>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {DAYS.map((d, idx) => (
                <div key={`h-${m}-${idx}`} className="text-[9px] text-gray-400 text-center">{d[0]}</div>
              ))}
              {cells.map((c, idx) => (
                <div key={idx} className="h-4">
                  {c.type === 'empty' && <div className="w-full h-[10px] rounded bg-gray-100" />}
                  {c.type === 'closed' && <div className="w-full h-[10px] rounded" style={{ background: COLORS.closed }} />}
                  {c.type === 'divisions' && (
                    <div className="w-full h-[10px] rounded overflow-hidden flex">
                      {c.percentages.map((pct, divIdx) => {
                        if (pct <= 0) return null
                        // Generate color for this division (0-10)
                        const mockDemand = 10
                        const mockSupply = divIdx === 0 ? 5.5 :  // -40% or worse
                                          divIdx === 1 ? 6.5 :   // -30% to -40%
                                          divIdx === 2 ? 7.5 :   // -20% to -30%
                                          divIdx === 3 ? 8.5 :   // -10% to -20%
                                          divIdx === 4 ? 9.5 :   // -5% to -10%
                                          divIdx === 5 ? 10 :    // -5% to +5% (balanced)
                                          divIdx === 6 ? 10.5 :  // +5% to +10%
                                          divIdx === 7 ? 11.5 :  // +10% to +20%
                                          divIdx === 8 ? 12.5 :  // +20% to +30%
                                          divIdx === 9 ? 13.5 :  // +30% to +40%
                                          15                      // +40% or more
                        const color = cellColor(mockDemand, mockSupply, role)
                        return <div key={divIdx} style={{ width: `${pct}%`, background: color }} />
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

