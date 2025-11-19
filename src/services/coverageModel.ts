import { getStateSnapshot, getHiresPerDay, isScheduledOn } from '../state/campaignPlan';
import { genWeek } from '../components/Campaign/CoverageHeatmap';

// Shared constants used across views
export const ONBOARDING_DELAY_DAYS = 3;
export const DAILY_QUIT_RATE = 0.10 / 30; // ~10% monthly attrition

/**
 * Compute average coverage percentage for a job over a number of weeks.
 * Mirrors the accumulation/distribution model used in CenterVisuals and CoverageHeatmap.
 */
export function computeCoveragePercentage(job: string, weeks: number, opts?: { withCampaign?: boolean; campaignForRole?: string }): number {
  const withCampaign = !!opts?.withCampaign;
  const campaignForRole = opts?.campaignForRole;

  let totalPct = 0;
  let openCount = 0;

  const planner = getStateSnapshot().planner;
  const plannerStart = planner.startDate ? new Date(planner.startDate) : null;
  if (plannerStart) plannerStart.setHours(0,0,0,0);
  const hiresPerDay = getHiresPerDay();
  const applyOverlay = withCampaign && (!!campaignForRole ? campaignForRole === job : true);

  for (let w = 0; w < weeks; w++) {
    // Start from baseline (no campaign overlay)
    const weekMatrix = genWeek(job, w, false);
    // Compute Monday for this offset; mirror CoverageHeatmap's week alignment
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + w * 7);
    mon.setHours(0,0,0,0);

    for (let d = 0; d < 7; d++) {
      const dateForDay = new Date(mon); dateForDay.setDate(mon.getDate() + d);

      // Accumulate employees as of this day (onboarding + attrition), if overlay applies
      let accumulated = 0;
      if (applyOverlay && plannerStart && dateForDay.getTime() >= plannerStart.getTime()) {
        const daysSinceStart = Math.floor((dateForDay.getTime() - plannerStart.getTime()) / (1000*60*60*24));
        for (let i = 0; i <= daysSinceStart; i++) {
          // daily attrition
          accumulated *= (1 - DAILY_QUIT_RATE);
          // add hires when campaign active and after onboarding delay
          const current = new Date(plannerStart); current.setDate(plannerStart.getDate() + i - ONBOARDING_DELAY_DAYS);
          if (i >= ONBOARDING_DELAY_DAYS && isScheduledOn(current)) {
            accumulated += hiresPerDay;
          }
        }
      }

      const extraHalfHoursPerDay = accumulated * (30/7) * 2;
      const daySlots = weekMatrix[d] || [];
      // Distribute extra half-hours evenly across open slots for this day
      const openSlots = Array.from({ length: 48 }, (_, idx) => idx).filter(idx => {
        const c = daySlots[idx];
        return c && !c.closed && (c.demand || 0) > 0;
      });
      const perSlot = openSlots.length > 0 ? (extraHalfHoursPerDay / openSlots.length) : 0;

      for (let s = 0; s < daySlots.length; s++) {
        const cell = daySlots[s];
        if (!cell || cell.closed || (cell.demand || 0) <= 0) continue;
        const supply = (cell.supply || 0) + (perSlot > 0 && openSlots.includes(s) ? Math.round(perSlot) : 0);
        const ratioPct = (supply / Math.max(1, cell.demand)) * 100;
        totalPct += ratioPct;
        openCount++;
      }
    }
  }

  if (openCount === 0) return 0;
  return Math.round(totalPct / openCount);
}


