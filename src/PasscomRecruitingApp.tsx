import { useState, useEffect, useRef } from 'react';
import CampaignManager from './components/Campaign/CampaignManager';
import AdvertisementManager from './components/Advertisement/AdvertisementManager';
import CompanyInformationSection from './components/Advertisement/CompanyInformationSection';

type Tab = 'campaign' | 'advertisement' | 'review' | 'company';

interface JobFormData {
  role: string;
  completed: boolean;
  data: any; // Store form data for each job
}

export default function PasscomRecruitingApp() {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    // Load persisted tab from localStorage
    const saved = localStorage.getItem('passcom-recruiting-active-tab');
    return (saved as Tab) || 'campaign';
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
  const availableJobs = ['Cook', 'Server', 'Bartender', 'Host'];

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

  const toggleJobSelection = (job: string) => {
    setSelectedJobs(prev =>
      prev.includes(job)
        ? prev.filter(j => j !== job)
        : [...prev, job]
    );
  };

  const tabs: { id: Tab; label: string }[] = [
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
                  <span className="text-gray-700 truncate">
                    {selectedJobs.length === 0 
                      ? 'Select Jobs' 
                      : selectedJobs.join(', ')}
                  </span>
                  <span className="text-gray-400">▼</span>
                </button>
                
                {showJobDropdown && (
                  <div className="absolute right-0 z-10 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg w-48">
                    {availableJobs.map((job) => (
                      <label
                        key={job}
                        className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedJobs.includes(job)}
                          onChange={() => toggleJobSelection(job)}
                          className="mr-2"
                        />
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
          <div className="h-full overflow-auto bg-gray-50">
            <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
              <div className="max-w-6xl mx-auto">
                <CompanyInformationSection />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

