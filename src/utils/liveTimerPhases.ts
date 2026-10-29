/**
 * How workout steps read on the OS live timer (Lock Screen / notification) and
 * on screen. Shared by the solo playback driver (screens/useWorkoutPlayback)
 * and class mode (class/useClassDriver).
 */

import { PhaseStep, WorkoutPhase } from '../types';
import { t } from '../i18n';
import type { LiveTimerPhase } from 'live-timer';

// Resolve the visible phase label at call time (never a module-level constant —
// canon § Translations: copy must follow the active language).
export const phaseLabel = (phase: WorkoutPhase): string => t(`workout.phase.${phase}`);

// Returns every remaining phase from `idx` onward, each at its full duration
// (a mid-step resume back-dates the start instead). The native module on
// iOS uses the full list to schedule its own boundary timer, so phase
// transitions don't depend on the JS bridge being awake.
export function phasesFrom(steps: PhaseStep[], idx: number): LiveTimerPhase[] {
  const out: LiveTimerPhase[] = [];
  for (let i = idx; i < steps.length; i++) {
    out.push({
      id: `step-${i}`,
      // A named interval shows its own name on the Lock Screen / notification.
      label: steps[i].label ?? phaseLabel(steps[i].phase),
      durationSeconds: steps[i].duration,
      ...(steps[i].countUp ? { countsUp: true } : {}),
    });
  }
  return out;
}
