import { useMemo } from 'react';
import { SankeyStep } from './SankeyDiagram';

interface InterviewStepsManagerProps {
  steps: SankeyStep[];
  onChange: (steps: SankeyStep[]) => void;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const randomId = () => `step-${Math.random().toString(36).slice(2, 9)}`;

export default function InterviewStepsManager({ steps, onChange }: InterviewStepsManagerProps) {
  const editableSteps = useMemo(() => steps, [steps]);

  const handleNameChange = (index: number, name: string) => {
    onChange(editableSteps.map((step, idx) => (idx === index ? { ...step, name } : step)));
  };

  const handleRateChange = (index: number, passRate: number) => {
    const value = clamp(Math.round(passRate), 0, 100);
    onChange(editableSteps.map((step, idx) => (idx === index ? { ...step, passRate: value } : step)));
  };

  const handleAddStep = () => {
    if (editableSteps.length >= 12) return;
    const insertionIndex = Math.max(editableSteps.length - 1, 0);
    const newStep = { id: randomId(), name: 'New Stage', passRate: 60 };
    const next = [...editableSteps];
    next.splice(insertionIndex, 0, newStep);
    onChange(next);
  };

  const handleRemoveStep = (index: number) => {
    if (editableSteps.length <= 2) return;
    const next = editableSteps.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= editableSteps.length) return;
    const next = [...editableSteps];
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Interview Pipeline</h3>
          <p className="text-sm text-gray-500">Edit the stages candidates move through and adjust the pass rate to the next stage.</p>
        </div>
        <button
          type="button"
          onClick={handleAddStep}
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-blue-600 text-blue-600 rounded-lg text-sm hover:bg-blue-50"
        >
          + Add Stage
        </button>
      </div>

      <div className="space-y-3">
        {editableSteps.map((step, index) => {
          const isFinal = index === editableSteps.length - 1;
          const canRemove = editableSteps.length > 2 && !isFinal;
          const canMoveUp = index > 0 && !isFinal;
          const canMoveDown = index < editableSteps.length - 2;

          return (
            <div key={step.id} className="border border-gray-200 rounded-xl px-4 py-3 bg-white shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex-1 lg:mr-6">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stage Name</label>
                  <input
                    type="text"
                    value={step.name}
                    onChange={(event) => handleNameChange(index, event.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Onsite Interview"
                  />
                </div>

                <div className="flex items-center gap-4">
                  {isFinal ? (
                    <div className="text-xs text-gray-500 italic">Final stage (no attrition)</div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Pass Rate</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={step.passRate}
                            onChange={(event) => handleRateChange(index, Number(event.target.value))}
                            className="w-40"
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={step.passRate}
                            onChange={(event) => handleRateChange(index, Number(event.target.value))}
                            className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`px-2 py-1 border rounded text-xs ${canMoveUp ? 'text-gray-600 border-gray-300 hover:bg-gray-100' : 'text-gray-400 border-gray-200 cursor-not-allowed'}`}
                      onClick={() => moveStep(index, -1)}
                      disabled={!canMoveUp}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 border rounded text-xs ${canMoveDown ? 'text-gray-600 border-gray-300 hover:bg-gray-100' : 'text-gray-400 border-gray-200 cursor-not-allowed'}`}
                      onClick={() => moveStep(index, 1)}
                      disabled={!canMoveDown}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`px-2 py-1 border rounded text-xs ${canRemove ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-gray-300 border-gray-200 cursor-not-allowed'}`}
                      onClick={() => handleRemoveStep(index)}
                      disabled={!canRemove}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
