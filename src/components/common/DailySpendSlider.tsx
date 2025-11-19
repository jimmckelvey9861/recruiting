import React, { useMemo } from 'react';
import { useCampaignPlanVersion, getMaxDailySpendCap, getStateSnapshot, setPlanner } from '../../state/campaignPlan';

export default function DailySpendSlider({
  label = 'Daily Spend Limit',
  showNumberInput = false,
}: {
  label?: string;
  showNumberInput?: boolean;
}) {
  const planVersion = useCampaignPlanVersion();
  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap();
    return Math.max(0, cap);
  }, [planVersion]);

  const planner = getStateSnapshot().planner;
  const value = Math.min(Math.max(0, Number(planner.dailySpend || 0)), sliderMax);

  const openSources = () => {
    try {
      localStorage.setItem('passcom-recruiting-active-tab','review');
      window.location.reload();
    } catch {}
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="text-gray-700 text-sm font-medium">{label}</span>
        <div className="ml-auto text-sm font-semibold text-gray-900">${Math.round(value)}</div>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={10}
          value={value}
          onChange={(e) => setPlanner({ dailySpend: Number(e.target.value || 0) })}
          className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${sliderMax ? (value / sliderMax) * 100 : 0}%, #e5e7eb ${sliderMax ? (value / sliderMax) * 100 : 0}%, #e5e7eb 100%)`
          }}
        />
        {showNumberInput && (
          <input
            type="number"
            min={0}
            max={sliderMax}
            step={10}
            value={value}
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
        const atActualCap = actualCap > 0 && (value >= actualCap || Math.abs(value - actualCap) <= 5);
        const showNoSources = actualCap === 0;
        if (!showNoSources && !atActualCap) return null;
        return (
          <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {showNoSources ? (
              <>
                No active sources configured. Enable sources to increase daily spend.
                <button className="ml-2 underline text-amber-800" onClick={openSources}>
                  Open Sources
                </button>
              </>
            ) : (
              <>
                Maximum spend limit. To increase, enable more sources.
                <button className="ml-2 underline text-amber-800" onClick={openSources}>
                  Open Sources
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}


