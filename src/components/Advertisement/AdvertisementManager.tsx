import JobFormSections from './JobFormSections';
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

  if (selectedJobs.length === 0) {
    // No jobs selected - show placeholder
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12 bg-white rounded-xl border">
            <p className="text-gray-500">Select a Job to create a Posting</p>
          </div>
        </div>
      </div>
    );
  }

  const activeJobForm = jobForms[0];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <CompanyInformationSection />
        {activeJobForm && (
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="p-6">
              <JobFormSections
                jobRole={activeJobForm.role}
                onComplete={() => {
                  setJobForms(prev => prev.map((f, i) => 
                    i === 0 ? { ...f, completed: true } : f
                  ));
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

