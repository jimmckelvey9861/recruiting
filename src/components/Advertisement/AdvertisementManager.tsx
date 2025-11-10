import { useState } from 'react';
import JobFormSections from './JobFormSections';
import MobilePreview from '../MobilePreview';
import CompanyInformationSection from './CompanyInformationSection';

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
  data: any;
}

interface AdvertisementManagerProps {
  selectedJobs: string[];
  jobForms: JobFormData[];
  setJobForms: React.Dispatch<React.SetStateAction<JobFormData[]>>;
}

export default function AdvertisementManager({ selectedJobs, jobForms, setJobForms }: AdvertisementManagerProps) {
  const [activeJobTab, setActiveJobTab] = useState(0);

  if (selectedJobs.length === 0) {
    // No jobs selected - show placeholder
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-gray-500">Select a Job or Jobs to create Advertisements</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <CompanyInformationSection />
        <div className="flex gap-6">
          {/* Mobile Preview */}
          <MobilePreview />
          
          {/* Form Content */}
          <div className="flex-1">
            {/* Job Tabs */}
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* Job Tab Headers */}
          <div className="border-b bg-gray-50 px-4 pt-3">
            <div className="flex gap-2 overflow-x-auto">
              {jobForms.map((job, index) => {
                const jobColor = JOB_BASE_COLORS[job.role] || '#3498DB';
                const isActive = activeJobTab === index;
                
                // Helper to convert hex to RGB and add alpha for lighter backgrounds
                const hexToRgba = (hex: string, alpha: number) => {
                  const r = parseInt(hex.slice(1, 3), 16);
                  const g = parseInt(hex.slice(3, 5), 16);
                  const b = parseInt(hex.slice(5, 7), 16);
                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                };
                
                return (
                  <button
                    key={job.role}
                    onClick={() => setActiveJobTab(index)}
                    className={`
                      px-4 py-2 rounded-t-lg font-medium text-sm transition-all flex items-center gap-2 whitespace-nowrap
                      ${isActive
                        ? 'text-white'
                        : job.completed
                          ? 'text-gray-800 hover:opacity-80 border border-b-0'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-b-0'
                      }
                    `}
                    style={isActive ? { 
                      backgroundColor: jobColor 
                    } : job.completed ? {
                      backgroundColor: hexToRgba(jobColor, 0.2)
                    } : undefined}
                  >
                    <span>{job.role}</span>
                    {job.completed && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Job Content with Sub-tabs */}
          <div className="p-6">
            {jobForms[activeJobTab] && (
              <JobFormSections
                jobRole={jobForms[activeJobTab].role}
                onComplete={() => {
                  setJobForms(prev => prev.map((f, i) => 
                    i === activeJobTab ? { ...f, completed: true } : f
                  ));
                }}
              />
            )}
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}

