import { useState, useEffect, useRef, useMemo } from 'react';
import CampaignManager from './components/Campaign/CampaignManager';
import AdvertisementManager from './components/Advertisement/AdvertisementManager';
import CampaignBuilder from './components/Needs/CampaignBuilder';

type Tab = 'needs' | 'campaign' | 'advertisement' | 'review' | 'company';

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
const FORECAST_DAYS = 90; // approximately a quarter

function createSeeder(job: string) {
  let seed = 0;
  for (let i = 0; i < job.length; i++) {
    seed = (seed << 5) - seed + job.charCodeAt(i);
    seed |= 0;
  }
  return Math.abs(seed) || 1;
}

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function calculateQuarterCoverage(job: string): number {
  const baseRequirement = JOB_REQUIREMENT_BASE[job] ?? 6;
  const rand = seededRandom(createSeeder(job) + 2031);
  let totalCoverage = 0;
  let count = 0;

  for (let day = 0; day < FORECAST_DAYS; day++) {
    for (let slot = 0; slot < HALF_HOURS_PER_DAY; slot++) {
      const demandVariation = 0.4 * (rand() - 0.5); // ±20%
      const required = Math.max(1, Math.round(baseRequirement * (1 + demandVariation)));
      const supplyVariation = 0.8 * (rand() - 0.4); // approx -40% to +40%
      const available = Math.max(0, required * (1 + supplyVariation));
      const ratio = available / required;
      const cappedRatio = Math.min(ratio, 1); // clamp to 100% coverage per requirements
      totalCoverage += cappedRatio * 100;
      count++;
    }
  }

  const averageCoverage = count > 0 ? totalCoverage / count : 0;
  return Math.min(Math.max(Math.round(averageCoverage), 0), 150);
}

interface JobFormData {
  role: string;
  completed: boolean;
  data: any; // Store form data for each job
}

const VALID_TABS: Tab[] = ['needs', 'campaign', 'advertisement', 'review', 'company'];

export default function PasscomRecruitingApp() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    // Load persisted tab from localStorage
    const saved = localStorage.getItem('passcom-recruiting-active-tab');
    return (VALID_TABS.includes(saved as Tab) ? (saved as Tab) : 'campaign');
  });

  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [jobForms, setJobForms] = useState<JobFormData[]>([]);
  
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

  const jobCoverageData = useMemo(() =>
    AVAILABLE_JOBS.map(job => ({
      job,
      color: JOB_BASE_COLORS[job] || '#2563eb',
      coverage: calculateQuarterCoverage(job)
    }))
  , []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'needs', label: 'Needs' },
    { id: 'campaign', label: 'Campaign' },
    { id: 'advertisement', label: 'Posting' },
    { id: 'review', label: 'Review' },
    { id: 'company', label: 'Company' }
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
              <div className="h-full grid grid-cols-12 gap-6">
                <section className="col-span-12 lg:col-span-3 bg-white border rounded-xl shadow-sm p-4 overflow-y-auto">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Jobs</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Coverage forecast for next quarter.
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
                <section className="col-span-12 lg:col-span-5 bg-white border rounded-xl shadow-sm p-4">
                  <div className="h-full w-full bg-gray-100 rounded-md border border-dashed border-gray-300" />
                </section>
                <section className="col-span-12 lg:col-span-4 bg-white border rounded-xl shadow-sm p-0 overflow-hidden">
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
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Review</h2>
              <p className="text-gray-500">Coming soon...</p>
            </div>
          </div>
        )}
        
        {activeTab === 'company' && (
          <div className="h-full flex items-center justify-center bg-gray-50">
            <div className="text-center px-6">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">Company Information</h2>
              <p className="text-gray-500 max-w-xl mx-auto">
                Company details are now part of the Advertisement workflow so you can manage employer branding alongside job ads.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

