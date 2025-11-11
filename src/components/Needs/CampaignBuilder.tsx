import React, { useState } from 'react';

export default function CampaignBuilder() {
  const [startDate, setStartDate] = useState('2025-11-05');
  const [dailyBudget, setDailyBudget] = useState(500);
  const [endGoalType, setEndGoalType] = useState<'hires' | 'date' | 'budget'>('hires');
  const [hiresTarget, setHiresTarget] = useState(25);
  const [endDate, setEndDate] = useState('2025-11-30');
  const [totalBudget, setTotalBudget] = useState(7000);

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
    <div className="h-full overflow-auto bg-white">
      <div className="p-5 space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">Campaign Planner</h2>
        
        {/* Start Date + Daily Spend */}
        <div className="space-y-3">
          <div className="flex items-center">
            <span className="text-gray-700 text-sm font-medium">Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ml-auto w-40 px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-700 text-sm font-medium">Daily Spend Target</span>
            <div className="relative ml-auto w-24">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                min="0"
                max="1000"
                className="w-full pl-5 pr-3 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="1000"
              step="10"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(Number(e.target.value))}
              className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${dailyBudget / 10}%, #e5e7eb ${dailyBudget / 10}%, #e5e7eb 100%)`
              }}
            />
            <div className="text-xs text-gray-500">$1000</div>
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
              onChange={() => setEndGoalType('hires')}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="hires" className="text-gray-700 text-sm cursor-pointer">Hires</label>
            <input
              type="number"
              value={hiresTarget}
              onChange={(e) => setHiresTarget(Number(e.target.value))}
              disabled={endGoalType !== 'hires'}
              className={`ml-auto w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold focus:outline-none focus:border-blue-500 ${
                endGoalType !== 'hires' ? 'bg-gray-100 text-gray-400' : ''
              }`}
            />
          </div>

          {/* Date Option */}
          <div className="flex items-center gap-3 mb-2.5">
            <input
              type="radio"
              id="date"
              name="endGoal"
              checked={endGoalType === 'date'}
              onChange={() => setEndGoalType('date')}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="date" className="text-gray-700 text-sm cursor-pointer">Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={endGoalType !== 'date'}
              className={`ml-auto px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 ${
                endGoalType !== 'date' ? 'bg-gray-100 text-gray-400' : ''
              }`}
            />
          </div>

          {/* Budget Option */}
          <div className="flex items-center gap-3">
            <input
              type="radio"
              id="budget"
              name="endGoal"
              checked={endGoalType === 'budget'}
              onChange={() => setEndGoalType('budget')}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="budget" className="text-gray-700 text-sm cursor-pointer">Budget</label>
            <div className="relative ml-auto w-28">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                value={totalBudget}
                onChange={(e) => setTotalBudget(Number(e.target.value))}
                disabled={endGoalType !== 'budget'}
                className={`w-full pl-6 pr-3 py-1.5 border border-gray-300 rounded-lg text-center text-sm font-semibold focus:outline-none focus:border-blue-500 ${
                  endGoalType !== 'budget' ? 'bg-gray-100 text-gray-400' : ''
                }`}
              />
            </div>
          </div>
        </div>

        {/* Build Campaign Button */}
        <button
          onClick={handleBuildCampaign}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors duration-200 text-sm"
        >
          Build Campaign
        </button>

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

