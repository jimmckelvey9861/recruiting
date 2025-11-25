import React, { useEffect, useMemo, useState } from 'react';
import { useCampaignPlanVersion, getHiresPerDay, getMaxDailySpendCap, getStateSnapshot, setPlanner } from '../../state/campaignPlan';

export default function OptimizerWizard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const planVersion = useCampaignPlanVersion();
  const cap = useMemo(() => Math.max(0, getMaxDailySpendCap()), [planVersion]);
  const currentSpend = getStateSnapshot().planner.dailySpend || 0;
  const currentHires = getHiresPerDay();

  const [targetMode, setTargetMode] = useState<'auto' | 'manual'>('auto');
  const plannerStrategy = (getStateSnapshot().planner as any).strategy || 'static';
  const [strategy, setStrategy] = useState<'static' | 'pulsed' | 'adaptive'>(plannerStrategy);
  const planner = getStateSnapshot().planner as any;
  const [pulse, setPulse] = useState<any>(() => planner.pulseParams || { periodDays: 14, onDays: 5, dailySpendOn: Math.max(0, planner.dailySpend || 0), phaseOffsetDays: 0, rampDays: 0 });
  const [adaptive, setAdaptive] = useState<any>(() => planner.adaptiveParams || { targetLower: 0.95, targetUpper: 1.05, lookaheadDays: 3, minOnDays: 3, minOffDays: 3, maxSpendPerDay: Math.max(0, planner.dailySpend || 0), maxDailySpendChange: 100, reoptimizeEveryDays: 7 });
  const [autoRenew, setAutoRenew] = useState<boolean>(!!planner.autoRenew);
  const [targetHires, setTargetHires] = useState<number>(() => {
    const v = currentHires || 0;
    // Default auto target: +20% over current, minimum 0.5/week ~ 0.07/day
    return Math.max(0.07, v * 1.2);
  });
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<'idle' | 'analyze' | 'optimize' | 'simulate' | 'done'>('idle');
  const [resultSpend, setResultSpend] = useState<number>(currentSpend);
  const [resultHires, setResultHires] = useState<number>(currentHires);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCancelled(false);
    setStep('idle');
    setRunning(false);
    setResultSpend(currentSpend);
    setResultHires(currentHires);
    if (targetMode === 'auto') {
      const v = currentHires || 0;
      setTargetHires(Math.max(0.07, v * 1.2));
    }
    // Seed adaptive bounds from Zones controller (white band) when dialog opens
    try {
      const raw = localStorage.getItem('passcom-plan-zones');
      if (raw) {
        const z = JSON.parse(raw);
        const low = Number(z?.lowYellow);
        const high = Number(z?.highYellow);
        if (Number.isFinite(low) && Number.isFinite(high)) {
          setAdaptive((prev:any) => ({
            ...prev,
            targetLower: Math.max(0, Math.min(2, low / 100)),
            targetUpper: Math.max(0, Math.min(3, high / 100)),
          }));
        }
      }
    } catch {}
  }, [open, planVersion]);

  async function run() {
    if (running) return;
    setRunning(true);
    const original = getStateSnapshot().planner.dailySpend || 0;
    try {
      // Step 1: Analyze
      setStep('analyze');
      await nextTick();
      if (cancelled) return;

      // Step 2: Optimize – based on selected strategy
      setStep('optimize');
      const target = targetHires;
      let bestSpend = original, bestHires = getHiresPerDay();
      if (strategy === 'static' || strategy === 'adaptive') {
        // static/adaptive: find steady-state daily budget that meets target
        let lo = 0, hi = Math.max(original, cap);
        for (let i = 0; i < 14; i++) {
          if (cancelled) break;
          const mid = (lo + hi) / 2;
          setPlanner({ dailySpend: Math.round(mid) });
          await nextTick();
          const h = getHiresPerDay();
          if ((h >= target && (bestHires < target || h < bestHires)) ||
              (h < target && bestHires < target && h > bestHires)) {
            bestHires = h;
            bestSpend = Math.round(mid);
          }
          if (h >= target) hi = mid; else lo = mid;
          if (Math.abs(hi - lo) < 1) break;
        }
      } else {
        // pulsed: compute average spend as dutyCycle * cap
        // approximate hires at cap
        const originalSpend = getStateSnapshot().planner.dailySpend || 0;
        setPlanner({ dailySpend: cap });
        await nextTick();
        const hiresAtCap = Math.max(0.0001, getHiresPerDay());
        setPlanner({ dailySpend: originalSpend });
        await nextTick();
        const dutyCycle = Math.max(0, Math.min(1, target / hiresAtCap));
        // Recommend period/onDays if not set
        const period = Math.max(1, Number(pulse.periodDays || 14));
        const onDays = Math.max(1, Number(pulse.onDays || Math.round(period * dutyCycle) || 1));
        const dailySpendOn = Math.min(cap, Math.max(0, Number(pulse.dailySpendOn || cap)));
        setPulse((p:any) => ({ ...p, periodDays: period, onDays, dailySpendOn }));
        bestSpend = Math.round(dailySpendOn * (onDays / period));
        setPlanner({ dailySpend: bestSpend });
        await nextTick();
        bestHires = getHiresPerDay();
      }
      if (cancelled) return;

      // Step 3: Simulate – fix spend and read final hires/day
      setPlanner({ dailySpend: bestSpend });
      await nextTick();
      setStep('simulate');
      const finalHires = getHiresPerDay();
      setResultSpend(bestSpend);
      setResultHires(finalHires);
      await nextTick();

      if (cancelled) return;
      setStep('done');
    } catch {
      // no-op; keep original spend
      setPlanner({ dailySpend: original });
    } finally {
      setRunning(false);
    }
  }

  function cancel() {
    setCancelled(true);
    onClose();
  }
  function applyAndClose() {
    // persist chosen strategy and parameters
    const patch: any = { strategy, autoRenew };
    if (strategy === 'pulsed') patch.pulseParams = pulse;
    if (strategy === 'adaptive') patch.adaptiveParams = adaptive;
    setPlanner(patch);
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={cancel}></div>
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-800">Optimize Campaign</h3>
          <button className="text-sm text-gray-500 hover:text-gray-700" onClick={cancel}>Close</button>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-gray-700">
            The optimizer will adjust Daily Budget to reach a target hires/day and allocate across sources using diminishing returns. It respects current caps and per‑source limits.
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-800">Strategy</div>
            <div className="flex items-center gap-2 text-sm">
              {(['static','pulsed','adaptive'] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2">
                  <input type="radio" checked={strategy===opt} onChange={() => setStrategy(opt)} />
                  <span>{opt.charAt(0).toUpperCase()+opt.slice(1)}</span>
                </label>
              ))}
            </div>
          </div>
          
          {strategy === 'pulsed' && (
            <div className="bg-gray-50 border rounded p-3 grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Period (days)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={pulse.periodDays}
                  onChange={(e)=> setPulse({ ...pulse, periodDays: Math.max(1, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">On days</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={pulse.onDays}
                  onChange={(e)=> setPulse({ ...pulse, onDays: Math.max(1, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Spend (on-days)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={pulse.dailySpendOn}
                  onChange={(e)=> setPulse({ ...pulse, dailySpendOn: Math.max(0, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Phase offset</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={pulse.phaseOffsetDays}
                  onChange={(e)=> setPulse({ ...pulse, phaseOffsetDays: Math.max(0, Number(e.target.value||0)) })} />
              </label>
            </div>
          )}

          {strategy === 'adaptive' && (
            <div className="bg-gray-50 border rounded p-3 grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Lower bound (%)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={Math.round((adaptive.targetLower||0)*100)}
                  onChange={(e)=> setAdaptive({ ...adaptive, targetLower: Math.max(0, Math.min(200, Number(e.target.value||0)))/100 })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Upper bound (%)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={Math.round((adaptive.targetUpper||0)*100)}
                  onChange={(e)=> setAdaptive({ ...adaptive, targetUpper: Math.max(0, Math.min(300, Number(e.target.value||0)))/100 })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Lookahead (days)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={adaptive.lookaheadDays}
                  onChange={(e)=> setAdaptive({ ...adaptive, lookaheadDays: Math.max(0, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Min on/off (days)</span>
                <div className="flex items-center gap-2">
                  <input type="number" className="w-20 border rounded px-2 py-1 text-right" value={adaptive.minOnDays}
                    onChange={(e)=> setAdaptive({ ...adaptive, minOnDays: Math.max(0, Number(e.target.value||0)) })} />
                  <input type="number" className="w-20 border rounded px-2 py-1 text-right" value={adaptive.minOffDays}
                    onChange={(e)=> setAdaptive({ ...adaptive, minOffDays: Math.max(0, Number(e.target.value||0)) })} />
                </div>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Max $/day</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={adaptive.maxSpendPerDay}
                  onChange={(e)=> setAdaptive({ ...adaptive, maxSpendPerDay: Math.max(0, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Max Δ/day</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={adaptive.maxDailySpendChange}
                  onChange={(e)=> setAdaptive({ ...adaptive, maxDailySpendChange: Math.max(0, Number(e.target.value||0)) })} />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-gray-600">Re‑optimize every (days)</span>
                <input type="number" className="w-24 border rounded px-2 py-1 text-right" value={adaptive.reoptimizeEveryDays}
                  onChange={(e)=> setAdaptive({ ...adaptive, reoptimizeEveryDays: Math.max(1, Number(e.target.value||0)) })} />
              </label>
            </div>
          )}
          
          <div className="text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={autoRenew} onChange={(e)=> setAutoRenew(e.target.checked)} />
              <span className="text-gray-700">Auto‑renew campaign when end goal is reached</span>
            </label>
          </div>

          <div className="bg-gray-50 border rounded p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Current Daily Budget</div>
              <div className="text-sm font-semibold">${Math.round(currentSpend).toLocaleString()}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Current Hires/day</div>
              <div className="text-sm font-semibold">{currentHires.toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-800">Target</div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={targetMode === 'auto'} onChange={() => setTargetMode('auto')} />
                <span>Auto (about +20%)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={targetMode === 'manual'} onChange={() => setTargetMode('manual')} />
                <span>Manual</span>
              </label>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-gray-600">Hires/day</span>
                <input
                  type="number"
                  className="w-24 border rounded px-2 py-1 text-right"
                  disabled={targetMode !== 'manual'}
                  value={targetHires}
                  onChange={(e) => setTargetHires(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-800">Progress</div>
            <div className="h-2 rounded bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: step === 'idle' ? '0%' : step === 'analyze' ? '25%' : step === 'optimize' ? '60%' : step === 'simulate' ? '85%' : '100%' }}
              />
            </div>
            <div className="text-xs text-gray-500">
              {step === 'idle' && 'Ready'}
              {step === 'analyze' && 'Analyzing schedule and caps…'}
              {step === 'optimize' && 'Optimizing daily budget and source mix…'}
              {step === 'simulate' && 'Simulating projected hires/day…'}
              {step === 'done' && 'Done'}
            </div>
          </div>

          <div className="bg-gray-50 border rounded p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Proposed Daily Budget</div>
              <div className="text-sm font-semibold">${Math.round(resultSpend).toLocaleString()}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Projected Hires/day</div>
              <div className="text-sm font-semibold">{resultHires.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button className="px-3 py-1.5 text-sm border rounded" onClick={cancel} disabled={running}>Cancel</button>
            {step !== 'done' ? (
              <button className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50" onClick={run} disabled={running}>
                {running ? 'Running…' : 'Run Optimizer'}
              </button>
            ) : (
              <button className="px-3 py-1.5 text-sm bg-green-600 text-white rounded" onClick={applyAndClose}>Apply</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function nextTick() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}


