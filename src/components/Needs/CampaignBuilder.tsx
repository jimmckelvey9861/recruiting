import React, { useState, useEffect, useMemo } from 'react';
import { setPlanner, setLiveView } from '../../state/campaignPlan';
import { getDerivedFromCriterion } from '../../state/campaignPlan';
import { useCampaignPlanVersion, getStateSnapshot, getHiresPerDay, getMaxDailySpendCap } from '../../state/campaignPlan';

export default function CampaignBuilder() {
  const planVersion = useCampaignPlanVersion();
  const snapshot = getStateSnapshot();
  const planner0 = snapshot.planner || { startDate: null, endType: 'budget', endValue: null, dailySpend: 0 };
  // derive initial local states from global planner
  const initStart = planner0.startDate || new Date().toISOString().slice(0,10);
  const initDaily = planner0.dailySpend || 0;
  const initEndType = (planner0.endType as 'hires' | 'date' | 'budget') || 'budget';
  const initHires = initEndType === 'hires' ? Math.round(Number(planner0.endValue || 0)) : 25;
  const initBudget = initEndType === 'budget' ? Math.round(Number(planner0.endValue || 0)) : 7000;
  const initEndDate = (() => {
    if (initEndType !== 'date' || !planner0.endValue) return new Date(new Date(initStart).getTime() + 14*24*60*60*1000).toISOString().slice(0,10);
    const sd = new Date(initStart); sd.setDate(sd.getDate() + Math.round(Number(planner0.endValue)));
    return sd.toISOString().slice(0,10);
  })();
  const [startDate, setStartDate] = useState(initStart);
  const [dailyBudget, setDailyBudget] = useState(initDaily);
  const [endGoalType, setEndGoalType] = useState<'hires' | 'date' | 'budget'>(initEndType);
  const [hiresTarget, setHiresTarget] = useState(initHires);
  const [endDate, setEndDate] = useState(initEndDate);
  const [totalBudget, setTotalBudget] = useState(initBudget);
  const [liveView, setLive] = useState(snapshot.liveView);

  // Compute days from start to end for 'date' end criterion
  const daysFromStart = useMemo(() => {
    if (!startDate || !endDate) return 0;
    const sd = new Date(startDate); sd.setHours(0,0,0,0);
    const ed = new Date(endDate); ed.setHours(0,0,0,0);
    return Math.max(0, Math.floor((ed.getTime() - sd.getTime()) / (1000*60*60*24)));
  }, [startDate, endDate]);

  useEffect(() => {
    setPlanner({ 
      startDate, 
      dailySpend: dailyBudget, 
      endType: endGoalType, 
      endValue: endGoalType==='budget'? totalBudget : (endGoalType==='hires'? hiresTarget : daysFromStart) 
    })
  }, [startDate, dailyBudget, endGoalType, hiresTarget, endDate, totalBudget, daysFromStart]);

  useEffect(() => { setLiveView(liveView) }, [liveView]);

  // When global planner changes (e.g., user moves slider on Sources tab), reflect into local UI
  useEffect(() => {
    const s = getStateSnapshot().planner;
    if (!s) return;
    if (s.dailySpend !== dailyBudget) setDailyBudget(s.dailySpend || 0);
    if (s.startDate && s.startDate !== startDate) setStartDate(s.startDate);
    if (s.endType && s.endType !== endGoalType) {
      setEndGoalType(s.endType as 'hires' | 'date' | 'budget');
    }
    if (s.endType === 'hires' && s.endValue != null && s.endValue !== hiresTarget) {
      setHiresTarget(Math.round(Number(s.endValue)));
    } else if (s.endType === 'budget' && s.endValue != null && s.endValue !== totalBudget) {
      setTotalBudget(Math.round(Number(s.endValue)));
    } else if (s.endType === 'date' && s.endValue != null) {
      const sd = new Date(s.startDate || startDate);
      sd.setDate(sd.getDate() + Math.round(Number(s.endValue)));
      const iso = sd.toISOString().slice(0,10);
      if (iso !== endDate) setEndDate(iso);
    }
  }, [planVersion]);

  // Bootstrap default sources if spend is increased from zero and no sources exist
  useEffect(() => {
    const snapshot = getStateSnapshot();
    const hasSources = (snapshot.sources || []).length > 0;
    if (dailyBudget > 0 && !hasSources) {
      try {
        const defaults = [
          { id:'seed_cpc', name:'Indeed Sponsored', active:true, spend_model:'cpc', color:'#2563eb', cpc:1.8, daily_budget:300 },
          { id:'seed_cpm', name:'Facebook Ads', active:true, spend_model:'cpm', color:'#4f46e5', cpm:9, daily_budget:200 },
          { id:'seed_ref', name:'Employee Referrals', active:true, spend_model:'referral', color:'#10b981', referral_bonus_per_hire:300, apps_override:5 }
        ] as any[];
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { setSourcesSnapshot } = require('../../state/campaignPlan');
        setSourcesSnapshot(defaults);
      } catch {}
    }
  }, [dailyBudget]);

  // Compute slider cap based on active sources (mirrors Review panel allocator cap)
  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap();
    return Math.max(0, cap || 1000);
  }, [planVersion]);

  // Clamp dailyBudget when cap changes
  useEffect(() => {
    setDailyBudget((prev) => Math.min(prev, sliderMax));
  }, [sliderMax]);

  const derived = getDerivedFromCriterion({
    startISO: startDate,
    endType: endGoalType,
    endValue: endGoalType==='date' ? daysFromStart : (endGoalType==='hires' ? hiresTarget : totalBudget),
    dailySpend: dailyBudget
  });

  const handleBuildCampaign = () => {
    const data = {
      startDate,
      dailyBudget,
      endGoalType,
      ...(endGoalType === 'hires' && { hiresTarget }),
      ...(endGoalType === 'date' && { endDate }),
      ...(endGoalType === 'budget' && { totalBudget })
    };
    
    console.log('Campaign Data:', data);
    alert(`Campaign Built!\n${JSON.stringify(data, null, 2)}`);
  };

  return (
    <div className="h-full overflow-auto bg-white max-w-[350px]">
      <div className="p-5 space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">Campaign Planner</h2>
        
        {/* Start Date + Daily Spend Limit */}
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="text-gray-700 text-sm font-medium">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ml-auto w-28 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-700 text-sm font-medium">Daily Spend Limit</span>
            <div className="ml-auto text-sm font-semibold text-gray-900">${Math.round(dailyBudget)}</div>
          </div>

          <div>
            <input
              type="range"
              min="0"
              max={sliderMax}
              step="10"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(Number(e.target.value))}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${sliderMax ? (dailyBudget / sliderMax) * 100 : 0}%, #e5e7eb ${sliderMax ? (dailyBudget / sliderMax) * 100 : 0}%, #e5e7eb 100%)`
              }}
            />
            {Number.isFinite(sliderMax) && sliderMax > 0 && (dailyBudget >= sliderMax || Math.abs(dailyBudget - sliderMax) <= 5) && (
              <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Maximum spend limit. To increase, enable more sources.
                <button
                  className="ml-2 underline text-amber-800"
                  onClick={()=>{
                    try {
                      localStorage.setItem('passcom-recruiting-active-tab','review');
                      window.location.reload();
                    } catch {}
                  }}
                >
                  Open Sources
                </button>
              </div>
            )}
          </div>

          {/* Estimated hires/day from current limit */}
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Estimated Hires/day</span>
            <span className="font-semibold">
              {(() => {
                const v = getHiresPerDay();
                if (v >= 3) return Math.round(v);
                return v.toFixed(1);
              })()}
            </span>
          </div>
        </div>

        {/* End Goal */}
        <div>
          <label className="block text-gray-700 text-sm font-medium mb-2.5">End Goal</label>
          
          {/* Hires Option */}
          <div className="flex items-center gap-3 mb-2.5">
            <input
              type="radio"
              id="hires"
              name="endGoal"
              checked={endGoalType === 'hires'}
              onChange={() => {
                const newH = Math.max(0, Math.round(derived.hires || 0));
                setHiresTarget(newH);
                setEndGoalType('hires');
                setPlanner({ endType: 'hires', endValue: newH });
              }}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="hires" className="text-gray-700 text-sm cursor-pointer">Hires</label>
            <input
              type={endGoalType === 'hires' ? 'number' : 'text'}
              value={endGoalType === 'hires' ? hiresTarget : Math.round(derived.hires)}
              onChange={(e) => setHiresTarget(Number(e.target.value))}
              readOnly={endGoalType !== 'hires'}
              className={`ml-auto w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-right text-sm font-semibold focus:outline-none focus:border-blue-500 ${endGoalType !== 'hires' ? 'bg-slate-100 text-blue-600' : ''}`}
              style={endGoalType !== 'hires' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
            />
          </div>

          {/* Date Option */}
          <div className="flex items-center gap-3 mb-2.5">
            <input
              type="radio"
              id="date"
              name="endGoal"
              checked={endGoalType === 'date'}
              onChange={() => {
                const newEndDate = derived.endDate || endDate;
                // compute days from start to newEndDate for planner endValue
                const sd = new Date(startDate); sd.setHours(0,0,0,0);
                const ed = new Date(newEndDate); ed.setHours(0,0,0,0);
                const newDays = Math.max(0, Math.floor((ed.getTime()-sd.getTime())/(1000*60*60*24)));
                setEndDate(newEndDate);
                setEndGoalType('date');
                setPlanner({ endType: 'date', endValue: newDays });
              }}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="date" className="text-gray-700 text-sm cursor-pointer">Date</label>
            <input
              type={endGoalType === 'date' ? 'date' : 'text'}
              value={endGoalType === 'date' ? endDate : (derived.endDate || '')}
              onChange={(e) => setEndDate(e.target.value)}
              readOnly={endGoalType !== 'date'}
              className={`ml-auto w-[140px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-right focus:outline-none focus:border-blue-500 ${endGoalType !== 'date' ? 'bg-slate-100 text-blue-600' : ''}`}
              style={endGoalType !== 'date' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
            />
          </div>

          {/* Budget Option */}
          <div className="flex items-center gap-3">
            <input
              type="radio"
              id="budget"
              name="endGoal"
              checked={endGoalType === 'budget'}
              onChange={() => {
                const newBudget = Math.max(0, Math.round(derived.budget || totalBudget || 0));
                setTotalBudget(newBudget);
                setEndGoalType('budget');
                setPlanner({ endType: 'budget', endValue: newBudget });
              }}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="budget" className="text-gray-700 text-sm cursor-pointer">Budget</label>
            <div className="relative ml-auto w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type={endGoalType === 'budget' ? 'number' : 'text'}
                value={endGoalType === 'budget' ? totalBudget : Math.round(derived.budget)}
              onChange={(e) => setTotalBudget(Number(e.target.value))}
                readOnly={endGoalType !== 'budget'}
                className={`w-full pl-6 pr-3 py-1.5 border border-gray-300 rounded-lg text-right text-sm font-semibold focus:outline-none focus:border-blue-500 ${endGoalType !== 'budget' ? 'bg-slate-100 text-blue-600' : ''}`}
                style={endGoalType !== 'budget' ? { backgroundColor: '#f1f5f9', color: '#2563eb' } : undefined}
              />
            </div>
          </div>
        </div>

        {/* Removed merge toggle and build button per request */}

        <style>{`
          input[type='range']::-webkit-slider-thumb {
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }

          input[type='range']::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #3b82f6;
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          }
        `}</style>
      </div>
    </div>
  );
}

