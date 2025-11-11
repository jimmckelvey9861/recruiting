import { useMemo, useState } from 'react';
import SankeyDiagram, { SankeySource, SankeyStep } from './SankeyDiagram';
import InterviewStepsManager from './InterviewStepsManager';
import { SOURCE_OPTIONS } from '../../constants/sourceColors';

interface ReviewPanelProps {
  selectedJobs: string[];
  selectedLocations: string[];
}

const DEFAULT_STEPS: SankeyStep[] = [
  { id: 'application_review', name: 'Application Review', passRate: 68 },
  { id: 'phone_screen', name: 'Phone Screen', passRate: 52 },
  { id: 'hiring_manager', name: 'Hiring Manager Interview', passRate: 58 },
  { id: 'offer', name: 'Offer', passRate: 72 },
  { id: 'hired', name: 'Hired', passRate: 100 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function ReviewPanel({ selectedJobs, selectedLocations }: ReviewPanelProps) {
  const [steps, setSteps] = useState<SankeyStep[]>(DEFAULT_STEPS);

  const sources = useMemo<SankeySource[]>(() => {
    const jobCount = selectedJobs.length || 1;
    const locationCount = selectedLocations.length || 1;
    const jobFactor = 1 + (jobCount - 1) * 0.32;
    const locationFactor = 1 + (locationCount - 1) * 0.26;

    const jobHash = selectedJobs.reduce((acc, job) => acc + job.length * 7, 11);
    const locationHash = selectedLocations.reduce((acc, loc) => acc + loc.length * 5, 17);

    return SOURCE_OPTIONS.slice(0, 10).map((option, index) => {
      const base = option.baseCount;
      const hash = Math.sin(base * 13 + index * 5 + jobHash + locationHash);
      const variance = 1 + hash * 0.18;
      const scaled = base * jobFactor * locationFactor * variance;
      return {
        key: option.key,
        label: option.label,
        count: Math.max(0, Math.round(clamp(scaled, base * 0.45, base * 5))),
      };
    });
  }, [selectedJobs, selectedLocations]);

  const locationsLabel = selectedLocations.length
    ? selectedLocations.join(', ')
    : 'All Locations';
  const jobsLabel = selectedJobs.length
    ? selectedJobs.join(', ')
    : 'All Jobs';

  return (
    <div className="h-full bg-gray-50 overflow-auto">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <section className="bg-white border rounded-xl shadow-sm p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Pipeline Health</h2>
              <p className="text-sm text-gray-500">{jobsLabel} · {locationsLabel}</p>
            </div>
            <div className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded-md px-3 py-1">
              Adjust stages below to see how conversion assumptions impact downstream hiring totals.
            </div>
          </div>
          <SankeyDiagram sources={sources} steps={steps} />
        </section>

        <section className="bg-white border rounded-xl shadow-sm p-6">
          <InterviewStepsManager steps={steps} onChange={setSteps} />
        </section>
      </div>
    </div>
  );
}
