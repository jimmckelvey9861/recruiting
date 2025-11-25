import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useCampaignPlanVersion, getMaxDailySpendCap, getStateSnapshot, setPlanner } from '../../state/campaignPlan';

export default function DailySpendSlider({
  label = 'Daily Budget',
  showNumberInput = false,
  variant = 'default', // 'default' | 'campaign'
  hideOpenLink = false,
}: {
  label?: string;
  showNumberInput?: boolean;
  variant?: 'default' | 'campaign';
  hideOpenLink?: boolean;
}) {
  const planVersion = useCampaignPlanVersion();
  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap();
    return Math.max(0, cap);
  }, [planVersion]);

  const planner = getStateSnapshot().planner;
  const rawValue = Math.max(0, Number(planner.dailySpend || 0));
  const valueClamped = Math.min(rawValue, sliderMax);

  const openSources = () => {
    try {
      localStorage.setItem('passcom-recruiting-active-tab','review');
      window.location.reload();
    } catch {}
  };

  // Custom SVG slider to match Plan/Heatmap knob visuals
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [svgWidth, setSvgWidth] = useState<number>(320);
  useEffect(() => {
    const measure = () => {
      const el = hostRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setSvgWidth(Math.max(160, Math.floor(rect.width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hostRef.current) ro.observe(hostRef.current);
    window.addEventListener('resize', measure);
    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener('resize', measure);
    };
  }, []);
  const H = 32;
  const trackH = 12;
  const r = 10;
  const knobX = sliderMax > 0 ? (valueClamped / sliderMax) * svgWidth : 0;
  const onClickSvg = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), svgWidth);
    const v = sliderMax > 0 ? Math.round((x / svgWidth) * sliderMax) : 0;
    setPlanner({ dailySpend: v });
  };
  const [drag, setDrag] = useState(false);
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), svgWidth);
    const v = sliderMax > 0 ? Math.round((x / svgWidth) * sliderMax) : 0;
    setPlanner({ dailySpend: v });
  };
  const endDrag = () => setDrag(false);

  const showHeader = variant !== 'campaign' && !!label;

  return (
    <div>
      {showHeader && (
        <div className="flex items-center gap-3">
          <span className="text-gray-700 text-sm font-medium">{label}</span>
          <div className="ml-auto text-sm font-semibold text-gray-900">${Math.round(rawValue)}</div>
        </div>
      )}
      <div className={`flex items-center gap-3 ${showHeader ? 'mt-2' : ''} min-w-0`}>
        <div ref={hostRef} className="flex-1 min-w-0">
          <svg
            width={svgWidth}
            height={H}
            className="block"
            onClick={onClickSvg}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            style={{ cursor: 'pointer' }}
          >
            <defs>
              <filter id="dss_knobShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.25" />
              </filter>
            </defs>
            {/* Track */}
            <rect
              x={0}
              y={(H - trackH) / 2}
              width={svgWidth}
              height={trackH}
              rx={trackH / 2}
              ry={trackH / 2}
              fill="#F7F7F7"
              stroke="#d1d5db"
            />
            {/* Filled portion */}
            <rect
              x={0}
              y={(H - trackH) / 2}
              width={Math.max(0, knobX)}
              height={trackH}
              rx={trackH / 2}
              ry={trackH / 2}
              fill="#3b82f6"
              opacity={0.4}
            />
            {/* Knob */}
            <g
              role="slider"
              aria-label="Daily Budget"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, sliderMax)}
              aria-valuenow={Math.round(rawValue)}
              tabIndex={0}
              onMouseDown={(e)=> { e.stopPropagation(); setDrag(true); }}
              onClick={(e)=> e.stopPropagation()}
              onKeyDown={(e) => {
                const step = 1;
                const big = Math.max(10, Math.round(sliderMax / 20));
                let next = rawValue;
                if (e.key === 'ArrowLeft') next = Math.max(0, rawValue - step);
                else if (e.key === 'ArrowRight') next = Math.min(sliderMax, rawValue + step);
                else if (e.key === 'PageDown') next = Math.max(0, rawValue - big);
                else if (e.key === 'PageUp') next = Math.min(sliderMax, rawValue + big);
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = sliderMax;
                else return;
                e.preventDefault();
                setPlanner({ dailySpend: Math.round(next) });
              }}
            >
              <circle
                cx={Math.min(Math.max(r, knobX), Math.max(r, svgWidth - r))}
                cy={H / 2}
                r={r}
                fill="#3b82f6"
                stroke="#ffffff"
                strokeWidth={3}
                filter="url(#dss_knobShadow)"
              />
            </g>
          </svg>
        </div>
        {/* Right-side value for campaign variant */}
        {variant === 'campaign' && (
          <div className="text-sm font-semibold text-gray-900 w-20 text-right">${Math.round(rawValue)}</div>
        )}
        {/* Optional numeric input for default variant only */}
        {variant !== 'campaign' && showNumberInput && (
          <input
            type="number"
            min={0}
            max={sliderMax}
            step={10}
            value={rawValue}
            onChange={(e) => {
              const v = Math.max(0, Math.min(sliderMax, Number(e.target.value || 0)));
              setPlanner({ dailySpend: v });
            }}
            className="w-28 text-sm border rounded px-2 py-1 outline-none text-right"
          />
        )}
      </div>
      {(() => {
        const actualCap = getMaxDailySpendCap();
        const atActualCap = actualCap > 0 && (rawValue >= actualCap || Math.abs(rawValue - actualCap) <= 5);
        const showNoSources = actualCap === 0;
        if (!showNoSources && !atActualCap) return null;
        return (
          <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {showNoSources ? (
              <>
                No active sources configured. Enable sources to increase daily spend.
                {!hideOpenLink && (
                  <button className="ml-2 underline text-amber-800" onClick={openSources}>
                    Open Sources
                  </button>
                )}
              </>
            ) : (
              <>
                Maximum budget. To increase, enable more sources.
                {!hideOpenLink && (
                  <button className="ml-2 underline text-amber-800" onClick={openSources}>
                    Open Sources
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}


