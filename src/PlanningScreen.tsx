import React, { useState } from 'react';

interface HeatmapCell {
  value: number;
  label: string;
}

const PlanningScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'week' | 'month' | 'year'>('week');
  const [selectedMetric, setSelectedMetric] = useState<'demand' | 'capacity' | 'variance'>('demand');

  // Mock data for heatmaps
  const generateHeatmapData = (rows: number, cols: number): HeatmapCell[][] => {
    return Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => ({
        value: Math.floor(Math.random() * 100),
        label: `${i}-${j}`,
      }))
    );
  };

  const weekData = generateHeatmapData(7, 24); // 7 days, 24 hours
  const monthData = generateHeatmapData(31, 12); // 31 days, 12 months
  const yearData = generateHeatmapData(5, 12); // 5 years, 12 months

  const getHeatmapColor = (value: number): string => {
    if (value < 20) return 'bg-blue-100';
    if (value < 40) return 'bg-blue-300';
    if (value < 60) return 'bg-yellow-300';
    if (value < 80) return 'bg-orange-400';
    return 'bg-red-500';
  };

  const getCurrentData = () => {
    switch (activeTab) {
      case 'week': return weekData;
      case 'month': return monthData;
      case 'year': return yearData;
      default: return weekData;
    }
  };

  const getAxisLabels = () => {
    switch (activeTab) {
      case 'week':
        return {
          x: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          y: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        };
      case 'month':
        return {
          x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          y: Array.from({ length: 31 }, (_, i) => `${i + 1}`)
        };
      case 'year':
        return {
          x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          y: ['2020', '2021', '2022', '2023', '2024']
        };
      default:
        return { x: [], y: [] };
    }
  };

  const { x: xLabels, y: yLabels } = getAxisLabels();
  const currentData = getCurrentData();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Demand Forecasting Dashboard</h1>
          <p className="text-gray-600">Analyze demand patterns across different time horizons</p>
        </div>

        {/* Navigation Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {(['week', 'month', 'year'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} View
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Heatmap */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Heatmap
                </h2>
                <select
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as 'demand' | 'capacity' | 'variance')}
                  className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                >
                  <option value="demand">Demand</option>
                  <option value="capacity">Capacity</option>
                  <option value="variance">Variance</option>
                </select>
              </div>

              {/* Heatmap Grid */}
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* X-axis labels */}
                  <div className="flex mb-2">
                    <div className="w-16"></div> {/* Space for Y-axis labels */}
                    {xLabels.map((label, i) => (
                      <div key={i} className="w-8 text-xs text-center text-gray-600 px-1">
                        {label}
                      </div>
                    ))}
                  </div>

                  {/* Heatmap rows */}
                  {currentData.map((row, i) => (
                    <div key={i} className="flex mb-1">
                      {/* Y-axis label */}
                      <div className="w-16 text-xs text-right text-gray-600 pr-2 py-1">
                        {yLabels[i]}
                      </div>
                      {/* Heatmap cells */}
                      {row.map((cell, j) => (
                        <div
                          key={j}
                          className={`w-8 h-6 mx-px ${getHeatmapColor(cell.value)} hover:opacity-75 cursor-pointer`}
                          title={`${yLabels[i]} - ${xLabels[j]}: ${cell.value}%`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="mt-4 flex items-center space-x-4">
                <span className="text-sm text-gray-600">Low</span>
                <div className="flex space-x-1">
                  {['bg-blue-100', 'bg-blue-300', 'bg-yellow-300', 'bg-orange-400', 'bg-red-500'].map((color, i) => (
                    <div key={i} className={`w-4 h-4 ${color}`} />
                  ))}
                </div>
                <span className="text-sm text-gray-600">High</span>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recruit Screen Stub */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recruitment Planning</h3>
              <div className="space-y-3">
                <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-400">
                  <p className="text-sm font-medium text-blue-800">Current Capacity</p>
                  <p className="text-2xl font-bold text-blue-900">1,247</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded border-l-4 border-yellow-400">
                  <p className="text-sm font-medium text-yellow-800">Projected Need</p>
                  <p className="text-2xl font-bold text-yellow-900">1,580</p>
                </div>
                <div className="p-3 bg-red-50 rounded border-l-4 border-red-400">
                  <p className="text-sm font-medium text-red-800">Gap</p>
                  <p className="text-2xl font-bold text-red-900">-333</p>
                </div>
                <button className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors">
                  Open Recruitment Plan
                </button>
              </div>
            </div>

            {/* Tests Panel */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Tests</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm font-medium text-green-800">Accuracy Test</span>
                  <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">PASS</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span className="text-sm font-medium text-green-800">Bias Test</span>
                  <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">PASS</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                  <span className="text-sm font-medium text-yellow-800">Drift Test</span>
                  <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">WARN</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                  <span className="text-sm font-medium text-red-800">Variance Test</span>
                  <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">FAIL</span>
                </div>
                <button className="w-full bg-gray-600 text-white py-2 px-4 rounded hover:bg-gray-700 transition-colors">
                  Run All Tests
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Avg Demand</span>
                  <span className="text-sm font-medium">67%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Peak Hours</span>
                  <span className="text-sm font-medium">9-11 AM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Low Season</span>
                  <span className="text-sm font-medium">Jan-Feb</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Model Accuracy</span>
                  <span className="text-sm font-medium">89.3%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="mt-8 flex justify-between items-center">
          <div className="flex space-x-4">
            <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors">
              Export Data
            </button>
            <button className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition-colors">
              Generate Report
            </button>
          </div>
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlanningScreen;
