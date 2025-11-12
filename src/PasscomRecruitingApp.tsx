import { useState, useEffect, useRef, useMemo } from 'react';
import CampaignManager from './components/Campaign/CampaignManager';
import AdvertisementManager from './components/Advertisement/AdvertisementManager';
import { genWeek } from './components/Campaign/CoverageHeatmap';
import CampaignBuilder from './components/Needs/CampaignBuilder';
import CenterVisuals, { RANGE_WEEKS as NEEDS_RANGE_WEEKS, RANGE_LABELS as NEEDS_RANGE_LABELS } from './components/Needs/CenterVisuals';
import ReviewPanel from './components/Review/ReviewPanel';
import DataInspector from './components/Data/DataInspector';
import { useOverrideVersion } from './state/dataOverrides';
import AdSourcesPanel from './components/Sources/AdSourcesPanel';

type Tab = 'needs' | 'campaign' | 'advertisement' | 'review' | 'sources' | 'data';

// Job base colors (matching CoverageHeatmap)
const JOB_BASE_COLORS: Record<string, string> = {
  "Server": "#D72A4D",       // Red
  "Cook": "#FB8331",         // Orange
  "Bartender": "#FFCB03",    // Yellow
  "Security": "#21BF6B",     // Green
  "Dishwasher": "#12B9B1",   // Teal
  "Manager": "#2E98DB",      // Light Blue
  "Cleaner": "#3967D6",      // Dark Blue
  "Barista": "#8855D0"       // Purple
};

const AVAILABLE_LOCATIONS = ['BOS', 'LGA', 'DCA', 'ORD'];
const AVAILABLE_JOBS = ['Server', 'Cook', 'Bartender', 'Security', 'Dishwasher', 'Manager', 'Cleaner', 'Barista'];

const JOB_REQUIREMENT_BASE: Record<string, number> = {
  "Server": 8,
  "Cook": 10,
  "Bartender": 6,
  "Security": 4,
  "Dishwasher": 7,
  "Manager": 3,
  "Cleaner": 5,
  "Barista": 6
};

const HALF_HOURS_PER_DAY = 48;

function calculateCoverage(job: string, weeks: number): number {
  let total = 0;
  let count = 0;
  for (let w = 0; w < weeks; w++) {
    const matrix = genWeek(job, w, false);
    for (const day of matrix) {
      for (const slot of day) {
        if (slot.closed || slot.demand <= 0) continue;
        const ratio = Math.min(slot.supply / Math.max(1, slot.demand), 1);
        total += ratio * 100;
        count++;
      }
    }
  }
  if (count === 0) return 0;
  return Math.round(total / count);
}

interface JobFormData {
  role: string;
  completed: boolean;
  data: any; // Store form data for each job
}

const VALID_TABS: Tab[] = ['needs', 'campaign', 'advertisement', 'review', 'sources', 'data'];

export default function PasscomRecruitingApp() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    // Load persisted tab from localStorage
    const saved = localStorage.getItem('passcom-recruiting-active-tab');
    return (VALID_TABS.includes(saved as Tab) ? (saved as Tab) : 'campaign');
  });

  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [jobForms, setJobForms] = useState<JobFormData[]>([]);
  const [needsRangeIdx, setNeedsRangeIdx] = useState<number>(1);
  const [dataInspectorJob, setDataInspectorJob] = useState<string>(AVAILABLE_JOBS[0]);
  const overrideVersion = useOverrideVersion();
  
  // Dropdown states
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);
  const jobDropdownRef = useRef<HTMLDivElement>(null);
  
  // Update job forms when selected jobs change
  useEffect(() => {
    setJobForms(prev => {
      const newForms = selectedJobs.map(role => {
        const existing = prev.find(f => f.role === role);
        return existing || { role, completed: false, data: {} };
      });
      return newForms;
    });
  }, [selectedJobs]);

  useEffect(() => {
    if (selectedJobs.length > 0) {
      setDataInspectorJob(selectedJobs[0]);
    }
  }, [selectedJobs]);

  // Persist tab selection
  useEffect(() => {
    localStorage.setItem('passcom-recruiting-active-tab', activeTab);
  }, [activeTab]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(event.target as Node)) {
        setShowLocationDropdown(false);
      }
      if (jobDropdownRef.current && !jobDropdownRef.current.contains(event.target as Node)) {
        setShowJobDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleLocationSelection = (location: string) => {
    setSelectedLocations(prev =>
      prev.includes(location)
        ? prev.filter(loc => loc !== location)
        : [...prev, location]
    );
  };

  const selectJob = (job: string) => {
    setSelectedJobs([job]);
    setShowJobDropdown(false);
  };

  const jobCoverageData = useMemo(() => {
    const weeks = NEEDS_RANGE_WEEKS[needsRangeIdx] ?? NEEDS_RANGE_WEEKS[1];
    return AVAILABLE_JOBS.map(job => ({
      job,
      color: JOB_BASE_COLORS[job] || '#2563eb',
      coverage: calculateCoverage(job, weeks)
    }));
  }, [needsRangeIdx, overrideVersion]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'needs', label: 'Needs' },
    { id: 'campaign', label: 'Campaign' },
    { id: 'advertisement', label: 'Posting' },
    { id: 'review', label: 'Review' },
    { id: 'sources', label: 'Sources' },
    { id: 'data', label: 'Data' }
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Passcom Recruiting</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-2 items-center justify-between">
            <div className="flex gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-6 py-3 font-medium text-sm transition-all
                    ${activeTab === tab.id
                      ? 'bg-blue-600 text-white rounded-t-lg shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-t-lg'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            {/* Location and Job Selectors */}
            <div className="flex gap-2">
              {/* Location Selector */}
              <div className="relative" ref={locationDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 min-w-[140px]"
                >
                  <span className="text-gray-700">
                    {selectedLocations.length === 0 
                      ? 'Select Locations' 
                      : selectedLocations.length === 1
                        ? selectedLocations[0]
                        : `${selectedLocations.length} stores`}
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
                
                {showLocationDropdown && (
                  <div className="absolute right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg w-48">
                    {AVAILABLE_LOCATIONS.map((location) => (
                      <label
                        key={location}
                        className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLocations.includes(location)}
                          onChange={() => toggleLocationSelection(location)}
                          className="mr-2"
                        />
                        <span className="text-sm">{location}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Selector */}
              <div className="relative" ref={jobDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowJobDropdown(!showJobDropdown)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 min-w-[140px]"
                >
                  {selectedJobs.length === 0 ? (
                    <span className="text-gray-700">Select Job</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded" style={{ background: JOB_BASE_COLORS[selectedJobs[0]] || '#3498DB' }} />
                      <span className="text-gray-700">{selectedJobs[0]}</span>
                    </div>
                  )}
                  <span className="text-gray-400 ml-auto">▼</span>
                </button>
                
                {showJobDropdown && (
                  <div className="absolute right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg w-48">
                    {AVAILABLE_JOBS.map((job) => (
                      <label
                        key={job}
                        className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        onClick={() => selectJob(job)}
                      >
                        <div 
                          className="w-4 h-4 rounded-full mr-2 flex items-center justify-center border-2 flex-shrink-0"
                          style={{ 
                            borderColor: JOB_BASE_COLORS[job] || '#3498DB',
                            background: selectedJobs.includes(job) ? (JOB_BASE_COLORS[job] || '#3498DB') : 'white'
                          }}
                        >
                          {selectedJobs.includes(job) && (
                            <div className="w-2 h-2 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="w-3 h-3 rounded mr-2 flex-shrink-0" style={{ background: JOB_BASE_COLORS[job] || '#3498DB' }} />
                        <span className="text-sm">{job}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'needs' && (
          <div className="h-full bg-gray-50">
            <div className="h-full max-w-7xl mx-auto px-6 py-8">
              <div className="h-full grid gap-6 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
                <section className="bg-white border rounded-xl shadow-sm p-4 overflow-y-auto">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Jobs</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Coverage forecast for the next {NEEDS_RANGE_LABELS[needsRangeIdx].toLowerCase()}.
                  </p>
                  <div className="mt-4 space-y-3">
                    {jobCoverageData.map(({ job, color, coverage }) => (
                      <div key={job} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                            {job}
                          </span>
                          <span>{coverage}%</span>
                        </div>
                        <div className="mt-2 h-2.5 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(coverage, 150) / 150 * 100}%`,
                              background: color
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="bg-white border rounded-xl shadow-sm p-4">
                  <CenterVisuals
                    job={selectedJobs[0] || AVAILABLE_JOBS[0]}
                    rangeIdx={needsRangeIdx}
                    onRangeChange={setNeedsRangeIdx}
                  />
                </section>
                <section className="bg-white border rounded-xl shadow-sm p-0 overflow-hidden">
                  <CampaignBuilder />
                </section>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'campaign' && (
          <div className="h-full overflow-auto">
            <CampaignManager
              selectedLocations={selectedLocations}
              setSelectedLocations={setSelectedLocations}
              selectedJobs={selectedJobs}
              setSelectedJobs={setSelectedJobs}
            />
          </div>
        )}
        
        {activeTab === 'advertisement' && (
          <div className="h-full overflow-auto bg-gray-50">
            <AdvertisementManager
              selectedJobs={selectedJobs}
              jobForms={jobForms}
              setJobForms={setJobForms}
            />
          </div>
        )}
        
        {activeTab === 'review' && (
          <ReviewPanel selectedJobs={selectedJobs} selectedLocations={selectedLocations} />
        )}
        
        {activeTab === 'sources' && (
          <div className="h-full bg-gray-50 overflow-auto">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <AdSourcesPanel />
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="h-full bg-gray-50">
            <div className="h-full max-w-7xl mx-auto px-6 py-8">
              <div className="h-full grid gap-6 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
                <section className="bg-white border rounded-xl shadow-sm p-4 overflow-y-auto">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Jobs</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Select a role to inspect and override raw demand/supply values.
                  </p>
                  <div className="mt-4 space-y-3">
                    {jobCoverageData.map(({ job, color, coverage }) => {
                      const active = job === dataInspectorJob;
                      return (
                        <button
                          key={job}
                          onClick={() => setDataInspectorJob(job)}
                          className={`w-full text-left border rounded-lg p-3 transition-colors ${
                            active ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                              {job}
                            </span>
                            <span>{coverage}%</span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(coverage, 150) / 150 * 100}%`,
                                background: color
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="h-full">
                  <DataInspector job={dataInspectorJob} />
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

