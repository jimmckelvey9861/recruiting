import { useState, useEffect, useRef } from 'react';
import CampaignManager from './components/Campaign/CampaignManager';
import AdvertisementManager from './components/Advertisement/AdvertisementManager';

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
  
  // Available options
  const availableLocations = ['BOS', 'LGA', 'DCA', 'ORD'];
  const availableJobs = ['Server', 'Cook', 'Bartender', 'Security', 'Dishwasher', 'Manager', 'Cleaner', 'Barista'];

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'needs', label: 'Needs' },
    { id: 'campaign', label: 'Campaign' },
    { id: 'advertisement', label: 'Advertisement' },
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
                    {availableLocations.map((location) => (
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
                    {availableJobs.map((job) => (
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
          <div className="h-full overflow-auto bg-gray-50">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-gray-800">Hiring Needs Overview</h2>
                <p className="text-gray-500 mt-1">
                  Review current store selections and job targets before building campaigns.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <div className="bg-white border rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Locations Selected</h3>
                  {selectedLocations.length === 0 ? (
                    <p className="mt-3 text-gray-500 text-sm">No locations selected yet. Choose locations using the selector above.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {selectedLocations.map(loc => (
                        <li key={loc} className="flex items-center gap-2 text-gray-700">
                          <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-semibold bg-blue-100 text-blue-600 rounded-full">
                            {loc.slice(0, 2).toUpperCase()}
                          </span>
                          <span>{loc}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="bg-white border rounded-xl p-4 shadow-sm">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Job Focus</h3>
                  {selectedJobs.length === 0 ? (
                    <p className="mt-3 text-gray-500 text-sm">Select a job to recruit for using the selector above.</p>
                  ) : (
                    <div className="mt-3 flex items-center gap-3">
                      <span
                        className="inline-block w-8 h-8 rounded-full border"
                        style={{ borderColor: JOB_BASE_COLORS[selectedJobs[0]] || '#3498DB', background: `${JOB_BASE_COLORS[selectedJobs[0]] || '#3498DB'}20` }}
                      />
                      <div>
                        <p className="text-gray-800 font-semibold">{selectedJobs[0]}</p>
                        <p className="text-xs text-gray-500">Primary role for current recruiting cycle</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Next Steps</h3>
                <ol className="list-decimal list-inside text-gray-600 space-y-2 text-sm">
                  <li>Confirm that the selected stores match your staffing needs.</li>
                  <li>Verify the target role aligns with the demand forecast.</li>
                  <li>Move to the Campaign tab to configure budgets, pacing, and sources.</li>
                  <li>Use the Advertisement tab to build role-specific job ads.</li>
                </ol>
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

