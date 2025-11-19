import { useMemo } from 'react'

export interface SankeySource {
  key: string
  label: string
  color: string
}

export interface SankeyStage {
  key: string
  label: string
  total: number
}

export interface SankeyOptions {
  width?: number
  height?: number
  columnWidth?: number
  columnGap?: number
  paddingTop?: number
  paddingBottom?: number
  showConversionRates?: boolean
  showRejectBar?: boolean
  rejectLabel?: string
}

interface ColumnDimensions {
  x: number
  y: number
  h: number
  w: number
  label: string
  total: number
}

interface StackLayout {
  tops: number[]
  heights: number[]
  amounts: number[]
}

interface SankeyDiagramProps {
  sources: SankeySource[]
  stages: SankeyStage[]
  flowData: number[][]
  options?: SankeyOptions
}

export default function SankeyDiagram({ sources, stages, flowData, options = {} }: SankeyDiagramProps) {
  const {
    width = 1000,
    height = 456,
    columnWidth = 120,
    columnGap = 160,
    paddingTop = 20,
    paddingBottom = 40,
    showConversionRates = true,
    showRejectBar = true,
    rejectLabel = 'Rejected',
  } = options

  const innerHeight = height - paddingTop - paddingBottom

  const ribbonPath = (x1: number, y1Top: number, y1Bot: number, x2: number, y2Top: number, y2Bot: number) => {
    const cx1 = x1 + (x2 - x1) * 0.45
    const cx2 = x2 - (x2 - x1) * 0.45
    return [
      `M ${x1} ${y1Top}`,
      `C ${cx1} ${y1Top}, ${cx2} ${y2Top}, ${x2} ${y2Top}`,
      `L ${x2} ${y2Bot}`,
      `C ${cx2} ${y2Bot}, ${cx1} ${y1Bot}, ${x1} ${y1Bot}`,
      'Z',
    ].join(' ')
  }

  const { colDims, stacks, conversionRates } = useMemo(() => {
    const maxStage = Math.max(1, ...stages.map((s) => s.total))
    const scaleY = (value: number) => (value / maxStage) * (innerHeight * 0.82)
    const colX = (index: number) => 40 + index * columnGap

    const columnDimensions: ColumnDimensions[] = stages.map((stage, index) => {
      const scaledHeight = scaleY(stage.total)
      const heightValue = Math.max(28, Number.isFinite(scaledHeight) ? scaledHeight : 0)
      const y = paddingTop + (innerHeight - heightValue) / 2
      const x = colX(index)
      return { x, y, h: heightValue, w: columnWidth, label: stage.label, total: stage.total }
    })

    const stackLayouts: StackLayout[] = columnDimensions.map((column, stageIdx) => {
      const stageTotals = stages[stageIdx]?.total ?? 0
      const amounts = sources.map((_, sourceIdx) => flowData[stageIdx]?.[sourceIdx] ?? 0)
      const heights = stageTotals > 0
        ? amounts.map((amount) => (amount / stageTotals) * column.h)
        : amounts.map(() => 0)
      const tops: number[] = []
      let accumulator = 0
      for (let k = 0; k < heights.length; k++) {
        tops.push(column.y + accumulator)
        accumulator += heights[k]
      }
      return { tops, heights, amounts }
    })

    const conversionSeries = stages.slice(0, -1).map((stage, index) => {
      const current = stage.total
      const next = stages[index + 1]?.total ?? 0
      if (current <= 0) return 0
      return next / current
    })

    return { colDims: columnDimensions, stacks: stackLayouts, conversionRates: conversionSeries }
  }, [stages, sources, flowData, innerHeight, columnGap, columnWidth, paddingTop])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: `${height}px` }}>
      {/* Ribbons */}
      {stages.slice(0, -1).map((_, stageIdx) => {
        const leftColumn = colDims[stageIdx]
        const rightColumn = colDims[stageIdx + 1]
        const leftStack = stacks[stageIdx]
        const rightStack = stacks[stageIdx + 1]
        if (!leftColumn || !rightColumn || !leftStack || !rightStack) return null

        return sources.map((source, sourceIdx) => {
          const lTop = leftStack.tops[sourceIdx] ?? leftColumn.y
          const lBot = lTop + (leftStack.heights[sourceIdx] ?? 0)
          const rTop = rightStack.tops[sourceIdx] ?? rightColumn.y
          const rBot = rTop + (rightStack.heights[sourceIdx] ?? 0)
          const d = ribbonPath(leftColumn.x + leftColumn.w, lTop, lBot, rightColumn.x, rTop, rBot)
          return <path key={`${stageIdx}-${source.key}`} d={d} fill={source.color} opacity={0.88} />
        })
      })}

      {/* Stage blocks + labels */}
      {colDims.map((column, index) => (
        <g key={column.label} transform={`translate(${column.x},${column.y})`}>
          <rect width={column.w} height={column.h} rx={10} fill="#f8fafc" stroke="#cbd5e1" />
          <text x={12} y={20} fontSize={13} fontWeight={600} fill="#111827">{column.label}</text>
          <text x={12} y={44} fontSize={26} fontWeight={700} fill="#111827">{column.total.toLocaleString()}</text>
        </g>
      ))}

      {/* Conversion rate labels */}
      {showConversionRates && stages.slice(0, -1).map((_, index) => {
        const leftColumn = colDims[index]
        const rightColumn = colDims[index + 1]
        const percentage = Math.round((conversionRates[index] ?? 0) * 100)
        const x1 = leftColumn.x + leftColumn.w
        const x2 = rightColumn.x
        const y = Math.min(leftColumn.y, rightColumn.y) - 6
        return (
          <text key={`conversion-${index}`} x={(x1 + x2) / 2} y={y} fontSize={12} textAnchor="middle" fill="#334155">
            {Number.isFinite(percentage) ? `${percentage}%` : '—'}
          </text>
        )
      })}

      {/* Legend (shifted 40px to the right) */}
      <g transform={`translate(${width - 180}, ${paddingTop + 50})`}>
        {sources.map((source, index) => (
          <g key={source.key} transform={`translate(0, ${index * 18})`}>
            <rect width={12} height={12} rx={2} fill={source.color} />
            <text x={18} y={10} fontSize={12} fill="#334155">{source.label}</text>
          </g>
        ))}
      </g>

      {/* Reject bar */}
      {showRejectBar && (
        <g transform={`translate(40, ${height - 28})`}>
          <rect width={width - 80} height={16} rx={8} fill="#e5e7eb" />
          <text x={(width - 80) / 2} y={12} fontSize={12} textAnchor="middle" fill="#334155">
            {rejectLabel}
          </text>
        </g>
      )}
    </svg>
  )
}
