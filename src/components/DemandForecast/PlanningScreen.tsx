
import { useState } from "react"

type Route = 'plan' | 'recruit'

interface PlanningScreenProps {
  selectedJobs: string[];
  setSelectedJobs: (jobs: string[]) => void;
  selectedLocations: string[]; // Kept for compatibility
  setSelectedLocations: (locations: string[]) => void; // Kept for compatibility
}

export default function PlanningScreen({ selectedJobs, setSelectedJobs }: PlanningScreenProps) {
  const roles = [
    { role: "Cook", demand: 10, supply: 7 },
    { role: "Server", demand: 8, supply: 8 },
    { role: "Bartender", demand: 5, supply: 3 },
    { role: "Host", demand: 4, supply: 5 }
  ]
  const [route, setRoute] = useState<Route>('plan')

  const toggleJobSelection = (role: string) => {
    setSelectedJobs(
      selectedJobs.includes(role) 
        ? selectedJobs.filter(r => r !== role)
        : [...selectedJobs, role]
    )
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      <div className="flex flex-1 overflow-hidden">
        {route === 'plan' ? (
          <>
            {/* Roles list */}
            <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto">
              <h2 className="text-xl font-semibold mb-4">Job Roles</h2>
              <div className="space-y-3">
              {roles.map((r) => {
                const gap = r.demand - r.supply
                const pct = Math.max(0, Math.min(100, (r.supply / Math.max(1, r.demand)) * 100))
                const isSelected = selectedJobs.includes(r.role)
                return (
                  <div
                    key={r.role}
                    onClick={() => setSelectedRole(r.role)}
                    className={`border rounded p-3 cursor-pointer hover:shadow transition ${
                      selectedRole === r.role ? 'ring-2 ring-blue-500' : ''
                    } ${
                      isSelected ? 'bg-blue-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{r.role}</div>
                        <div className="text-xs text-gray-500">Demand {r.demand} | Supply {r.supply}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-gray-700 min-w-[52px] text-right">
                          {gap > 0 ? `+${gap}` : 'OK'}
                        </div>
                        <button 
                          className={`border rounded px-2 py-0.5 text-xs transition ${
                            isSelected 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            toggleJobSelection(r.role);
                          }}
                        >
                          Recruit
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full bg-gray-200 rounded">
                      <div className="h-2 rounded bg-blue-500" style={{ width: pct + '%' }} />
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          </>
        ) : (
          /* Recruiting route placeholder */
          <div className="flex-1 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recruiting</h2>
              <button className="border rounded px-3 py-1 text-sm" onClick={()=>setRoute('plan')}>Back to Planning</button>
            </div>
            <div className="rounded border bg-white p-4 text-sm text-gray-600">
              This is a placeholder for the dedicated Recruiting screen (campaign setup, sources, budget, creatives).
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
