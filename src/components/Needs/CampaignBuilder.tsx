import React, { useState, useEffect, useMemo } from 'react';
import { setPlanner, setLiveView } from '../../state/campaignPlan';
import { getDerivedFromCriterion } from '../../state/campaignPlan';
import { useCampaignPlanVersion, getStateSnapshot, getHiresPerDay, getApplicantsPerDay, getMaxDailySpendCap } from '../../state/campaignPlan';
import DailySpendSlider from '../common/DailySpendSlider';
import OptimizerWizard from '../Plan/OptimizerWizard';

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
  const [optOpen, setOptOpen] = useState(false);

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

  // Compute slider cap based on active sources (mirrors Review panel allocator cap)
  const sliderMax = useMemo(() => {
    const cap = getMaxDailySpendCap();
    // No fallback; if cap is 0, the slider will remain at 0 and show guidance
    return Math.max(0, cap);
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
        <div className="flex items-center">
          <h2 className="text-lg font-semibold text-gray-800">Campaign Planner</h2>
          <div className="ml-auto">
            <button
              className="px-2.5 py-1.5 text-sm bg-blue-600 text-white rounded shadow hover:bg-blue-700"
              onClick={() => setOptOpen(true)}
            >
              Optimize
            </button>
          </div>
        </div>
        
        {/* Start Date + Daily Budget */}
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

          <DailySpendSlider />

          {/* Applications/day */}
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>Applications/day</span>
            <span className="font-semibold">
              {(() => {
                const a = getApplicantsPerDay();
                return a >= 3 ? Math.round(a) : a.toFixed(1);
              })()}
            </span>
          </div>

          {/* Hires per day or week (dynamic label) */}
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span>
              {(() => {
                const h = getHiresPerDay();
                return h < 1 ? 'Hires/week' : 'Hires/day';
              })()}
            </span>
            <span className="font-semibold">
              {(() => {
                const h = getHiresPerDay();
                const val = h < 1 ? (h * 7) : h;
                return val >= 3 ? Math.round(val) : val.toFixed(1);
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
      <OptimizerWizard open={optOpen} onClose={() => setOptOpen(false)} />
    </div>
  );
}

