import { useMemo } from 'react';
import { SOURCE_COLORS, SOURCE_LABELS } from '../../constants/sourceColors';

type SankeyStep = {
  id: string;
  name: string;
  passRate: number; // percentage 0-100, ignored for final stage
};

type SankeySource = {
  key: string;
  label: string;
  count: number;
};

interface SankeyDiagramProps {
  sources: SankeySource[];
  steps: SankeyStep[];
}

interface ColumnNode {
  value: number;
  y0: number;
  y1: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function SankeyDiagram({ sources, steps }: SankeyDiagramProps) {
  const limitedSources = useMemo(() => sources.slice(0, 10), [sources]);

  const hasData = limitedSources.some((s) => s.count > 0);

  const { columnValues, columnLayouts, totalsByColumn } = useMemo(() => {
    const sanitizedSources = limitedSources.map((source) => ({
      ...source,
      count: Math.max(0, Math.round(source.count)),
    }));

    const baseCounts = sanitizedSources.map((s) => s.count);
    const columnValuesInternal: number[][] = [baseCounts];

    let stageCounts = baseCounts;
    steps.forEach((step, idx) => {
      columnValuesInternal.push(stageCounts);
      if (idx < steps.length - 1) {
        const rate = clamp(step.passRate, 0, 100) / 100;
        stageCounts = stageCounts.map((value) => Math.max(0, Math.round(value * rate)));
      }
    });

    const margins = { top: 48, bottom: 36 };
    const height = 400;
    const availableHeight = height - margins.top - margins.bottom;
    const nodePad = 14;

    const columnLayoutsInternal: ColumnNode[][] = columnValuesInternal.map((values) => {
      const total = values.reduce((sum, v) => sum + v, 0);
      if (total <= 0) {
        const slotHeight = values.length > 0 ? (availableHeight - nodePad * (values.length - 1)) / values.length : 0;
        let y = margins.top;
        return values.map(() => {
          const h = Math.max(0, slotHeight);
          const node = { value: 0, y0: y, y1: y + h };
          y += h + nodePad;
          return node;
        });
      }

      const scale = (availableHeight - nodePad * (values.length - 1)) / total;
      let y = margins.top;
      return values.map((value) => {
        const size = clamp(value * scale, 0, availableHeight);
        const node = { value, y0: y, y1: y + size };
        y += size + nodePad;
        return node;
      });
    });

    const totals = columnValuesInternal.map((values) => values.reduce((sum, v) => sum + v, 0));

    return {
      columnValues: columnValuesInternal,
      columnLayouts: columnLayoutsInternal,
      totalsByColumn: totals,
    };
  }, [limitedSources, steps]);

  if (!hasData || columnValues[0].reduce((sum, value) => sum + value, 0) === 0) {
    return (
      <div className="border border-dashed border-gray-300 rounded-xl py-16 text-center text-gray-500">
        Add applicants to visualize candidate flow.
      </div>
    );
  }

  const width = 960;
  const height = 400;
  const marginLeft = 160;
  const marginRight = 120;
  const marginTop = 48;
  const marginBottom = 36;
  const nodeWidth = 18;

  const columnCount = columnValues.length;
  const columnGap = columnCount > 1 ? (width - marginLeft - marginRight) / (columnCount - 1) : 0;
  const columnX = (index: number) => marginLeft + index * columnGap;
  const nodeLeft = (index: number) => columnX(index) - nodeWidth / 2;
  const nodeRight = (index: number) => columnX(index) + nodeWidth / 2;
  const curveOffset = columnGap * 0.45;

  const columnTitles = ['Sources', ...steps.map((step) => step.name)];

  const totalApplicants = columnValues[0].reduce((sum, val) => sum + val, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Candidate Flow Overview</h3>
          <p className="text-sm text-gray-500">{totalApplicants.toLocaleString()} candidates across {limitedSources.length} source{limitedSources.length === 1 ? '' : 's'}.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {limitedSources.map((source) => (
            <span key={source.key} className="inline-flex items-center gap-2 px-3 py-1 border border-gray-200 rounded-full bg-white shadow-sm">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: SOURCE_COLORS[source.key] || '#94a3b8' }} />
              <span className="font-medium text-gray-700">{SOURCE_LABELS[source.key] || source.label}</span>
              <span className="text-gray-500">{source.count.toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[400px]">
          <defs>
            <linearGradient id="sankeyShadow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {columnTitles.map((title, index) => (
            <text
              key={title}
              x={columnX(index)}
              y={marginTop - 22}
              textAnchor="middle"
              className="text-[12px] font-semibold fill-gray-600"
            >
              {title}
            </text>
          ))}

          {columnLayouts.map((column, colIndex) => (
            <g key={colIndex}>
              {column.map((node, sourceIndex) => {
                const sourceKey = limitedSources[sourceIndex]?.key ?? String(sourceIndex);
                const fill = colIndex === 0 ? SOURCE_COLORS[sourceKey] || '#94a3b8' : '#e2e8f0';
                const opacity = colIndex === 0 ? 0.85 : 0.35;
                const heightValue = node.y1 - node.y0;
                if (heightValue <= 0) {
                  return null;
                }

                return (
                  <g key={`${colIndex}-${sourceIndex}`}>
                    <rect
                      x={nodeLeft(colIndex)}
                      y={node.y0}
                      width={nodeWidth}
                      height={heightValue}
                      fill={fill}
                      fillOpacity={opacity}
                      stroke={colIndex === 0 ? 'rgba(15, 23, 42, 0.35)' : 'rgba(148, 163, 184, 0.4)'}
                      strokeWidth={colIndex === 0 ? 0.6 : 0.4}
                      rx={colIndex === 0 ? 3 : 6}
                    />
                    {colIndex === 0 && (
                      <text
                        x={nodeLeft(colIndex) - 12}
                        y={(node.y0 + node.y1) / 2}
                        textAnchor="end"
                        alignmentBaseline="middle"
                        className="text-[11px] fill-slate-700"
                      >
                        {limitedSources[sourceIndex].label}
                      </text>
                    )}
                    <text
                      x={nodeRight(colIndex) + 10}
                      y={(node.y0 + node.y1) / 2}
                      textAnchor="start"
                      alignmentBaseline="middle"
                      className="text-[10px] fill-slate-500"
                    >
                      {node.value.toLocaleString()}
                    </text>
                  </g>
                );
              })}

              <text
                x={columnX(colIndex)}
                y={height - marginBottom + 18}
                textAnchor="middle"
                className="text-[11px] fill-slate-500"
              >
                {totalsByColumn[colIndex].toLocaleString()} candidates
              </text>
            </g>
          ))}

          {columnLayouts.slice(0, -1).map((column, colIndex) => (
            <g key={`links-${colIndex}`}>
              {column.map((node, sourceIndex) => {
                const nextNode = columnLayouts[colIndex + 1]?.[sourceIndex];
                if (!nextNode) return null;
                const startHeight = node.y1 - node.y0;
                const endHeight = nextNode.y1 - nextNode.y0;
                if (startHeight <= 0 && endHeight <= 0) return null;
                const sourceKey = limitedSources[sourceIndex]?.key ?? String(sourceIndex);
                const color = SOURCE_COLORS[sourceKey] || '#94a3b8';
                const opacity = 0.55;

                const x0 = nodeRight(colIndex);
                const x1 = nodeLeft(colIndex + 1);
                const y0Top = node.y0;
                const y0Bottom = node.y1;
                const y1Top = nextNode.y0;
                const y1Bottom = nextNode.y1;

                const d = [
                  `M ${x0},${y0Top}`,
                  `C ${x0 + curveOffset},${y0Top} ${x1 - curveOffset},${y1Top} ${x1},${y1Top}`,
                  `L ${x1},${y1Bottom}`,
                  `C ${x1 - curveOffset},${y1Bottom} ${x0 + curveOffset},${y0Bottom} ${x0},${y0Bottom}`,
                  'Z',
                ].join(' ');

                return (
                  <path
                    key={`${colIndex}-${sourceIndex}`}
                    d={d}
                    fill={color}
                    fillOpacity={opacity}
                    stroke={color}
                    strokeOpacity={0.4}
                    strokeWidth={0.6}
                  />
                );
              })}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export type { SankeySource, SankeyStep };
