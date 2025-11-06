import { useMemo, useState } from "react"

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
const HALF_HOUR_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? "00" : "30"
  return `${h.toString().padStart(2,'0')}:${m}`
})

const COLORS = {
  green: "#10b981",
  yellow: "#fde047",
  red: "#ef4444",
  closed: "#e5e7eb",
  g20: "#047857",
  g30: "#065f46",
  r20: "#b91c1c",
  r30: "#7f1d1d"
}

function classifyDelta(delta: number) {
  if (delta >= 0.05) return 'green'
  if (delta <= -0.05) return 'red'
  return 'yellow'
}

function cellColor(demand: number, supply: number) {
  if (demand <= 0 && supply <= 0) return COLORS.closed
  const delta = (supply - Math.max(0, demand)) / Math.max(1, demand)
  if (delta >= 0.3) return COLORS.g30
  if (delta >= 0.2) return COLORS.g20
  if (delta >= 0.1) return COLORS.green
  if (delta <= -0.3) return COLORS.r30
  if (delta <= -0.2) return COLORS.r20
  if (delta <= -0.1) return COLORS.red
  return COLORS.yellow
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
  const base = role === "Cook" ? 10 : role === "Server" ? 8 : role === "Bartender" ? 5 : 4
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
      const supply = Math.max(0, Math.round(demand * (0.86 + (d % 3) * 0.03) + noise(weekOffset, d, s)))
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
  const [selectedRole, setSelectedRole] = useState(availableJobs[0] || "Cook")
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
        <div className="mb-3 p-2 border rounded bg-gray-50 text-xs flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.g30}}/>30%+ over</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.g20}}/>20% over</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.green}}/>10% over</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.yellow}}/>match</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.red}}/>10% short</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.r20}}/>20% short</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.r30}}/>30%+ short</span>
          <span className="inline-flex items-center gap-1 text-gray-500"><span className="inline-block w-4 h-3 rounded" style={{background:COLORS.closed}}/>closed / no demand</span>
        </div>
      )}

      <div className="overflow-auto max-h-[400px]">
        {viewMode === 'week' && (
          <WeekGrid weekMatrix={weekMatrix} />
        )}
        {viewMode === 'month' && (
          <MonthGrid
            weekMatrix={weekMatrix}
            year={currentYear}
            month={currentMonth}
            onDayClick={(dateObj: Date)=>goToWeekContaining(dateObj)}
          />
        )}
        {viewMode === 'year' && (
          <YearGridDays
            weekMatrix={weekMatrix}
            year={currentYear}
            onMonthClick={(monthIdx: number)=>goToMonth(currentYear, monthIdx)}
          />
        )}
      </div>
    </div>
  )
}

function WeekGrid({ weekMatrix }: { weekMatrix: { demand: number; supply: number; closed: boolean }[][] }) {
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
                <div className="relative h-[10px] sticky left-0 bg-white">
                  {showLabel && (
                    <span className="absolute -translate-y-2 text-[9px] leading-none text-gray-500">{hourLabel}</span>
                  )}
                </div>
                {weekMatrix.map((daySlots, dayIdx) => {
                  const { demand, supply, closed } = daySlots[rowIdx]
                  const bg = closed ? COLORS.closed : cellColor(demand, supply)
                  return (
                    <div
                      key={`${dayIdx}-${rowIdx}`}
                      title={`D:${demand} S:${supply}${closed?' (closed)':''}`}
                      style={{ height: '10px', background: bg }}
                    />
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

function MonthGrid(
  { weekMatrix, year, month, onDayClick }:
  { weekMatrix: { demand: number; supply: number; closed: boolean }[][], year: number, month: number, onDayClick?: (d: Date)=>void }
) {
  const countsByWeekday = weekMatrix.map(daySlots => {
    let green = 0, yellow = 0, red = 0, open = 0
    for (const { demand, supply, closed } of daySlots) {
      if (closed) continue
      open++
      const delta = (supply - Math.max(0, demand)) / Math.max(1, demand)
      const cls = classifyDelta(delta)
      if (cls === 'green') green++
      else if (cls === 'red') red++
      else yellow++
    }
    return { green, yellow, red, open }
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
    const counts = countsByWeekday[weekday]
    if (!counts || counts.open === 0) return { label: String(dayNum), type: 'closed' as const, dateObj: dt }
    const total = counts.green + counts.yellow + counts.red
    const gW = total ? (counts.green / total) * 100 : 0
    const yW = total ? (counts.yellow / total) * 100 : 0
    const rW = total ? (counts.red / total) * 100 : 0
    return { label: String(dayNum), type: 'stripe' as const, gW, yW, rW, dateObj: dt }
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
          {c.type === 'stripe' && (
            <div className="flex-1 rounded overflow-hidden flex">
              {c.gW > 0 && <div style={{ width: `${c.gW}%`, background: COLORS.green }} />}
              {c.yW > 0 && <div style={{ width: `${c.yW}%`, background: COLORS.yellow }} />}
              {c.rW > 0 && <div style={{ width: `${c.rW}%`, background: COLORS.red }} />}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function YearGridDays(
  { weekMatrix, year, onMonthClick }:
  { weekMatrix: { demand: number; supply: number; closed: boolean }[][], year?: number, onMonthClick?: (m: number)=>void }
) {
  const countsByWeekday = weekMatrix.map(daySlots => {
    let green = 0, yellow = 0, red = 0, open = 0
    for (const { demand, supply, closed } of daySlots) {
      if (closed) continue
      open++
      const delta = (supply - Math.max(0, demand)) / Math.max(1, demand)
      const cls = classifyDelta(delta)
      if (cls === 'green') green++
      else if (cls === 'red') red++
      else yellow++
    }
    return { green, yellow, red, open }
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
          const c = countsByWeekday[weekday]
          if (!c || c.open === 0) return { type: 'closed' as const }
          const total = c.green + c.yellow + c.red
          const gW = total ? (c.green / total) * 100 : 0
          const yW = total ? (c.yellow / total) * 100 : 0
          const rW = total ? (c.red / total) * 100 : 0
          return { type: 'stripe' as const, gW, yW, rW }
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
                  {c.type === 'stripe' && (
                    <div className="w-full h-[10px] rounded overflow-hidden flex">
                      {c.gW > 0 && <div style={{ width: `${c.gW}%`, background: COLORS.green }} />}
                      {c.yW > 0 && <div style={{ width: `${c.yW}%`, background: COLORS.yellow }} />}
                      {c.rW > 0 && <div style={{ width: `${c.rW}%`, background: COLORS.red }} />}
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

