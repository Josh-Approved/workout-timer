import { PhaseStep } from '../types';

/**
 * The workout playback engine — the pure trust core behind ActiveWorkoutScreen's
 * run/pause/resume/skip/back controls. Everything here is a pure function of the
 * built phase sequence (utils/workout.ts) and the current position; the screen
 * owns only the wall-clock interval and the audio/haptic/live-timer side effects
 * and drives its DisplayState through these functions. Keeping the state maths
 * here (rather than inline in the component) is what lets the intent fuzzer
 * exercise the REAL engine at the pure-logic level (Uplevel 3 / T1) — device
 * behaviour lives in T4.
 *
 * The state is exactly what the screen renders: a mode, the index of the active
 * step, and the seconds left in it. `pause`/`resume` are deliberately absent —
 * pausing is the screen simply not calling `advance`, so the position is frozen
 * with no time lost or invented (the "background + relaunch resumes the same
 * point" property, at pure-logic level).
 */

export type PlaybackMode = 'phase' | 'complete';

export interface PlaybackState {
  mode: PlaybackMode;
  stepIndex: number;
  timeRemaining: number;
}

/** What `advance`/`skip` did, so the screen can fire the matching cue. */
export type PlaybackEvent = 'tick' | 'phase-start' | 'complete';

/** The position at the first frame of a workout: step 0 at its full duration. */
export function initialPlayback(steps: PhaseStep[]): PlaybackState {
  if (steps.length === 0) return { mode: 'phase', stepIndex: 0, timeRemaining: 0 };
  return { mode: 'phase', stepIndex: 0, timeRemaining: steps[0].duration };
}

/**
 * One second of the running clock elapses. Within a step the remaining time
 * ticks down; crossing zero either starts the next step at its full duration
 * ('phase-start') or ends the workout ('complete').
 */
export function advancePlayback(
  steps: PhaseStep[],
  s: PlaybackState,
): { next: PlaybackState; event: PlaybackEvent } {
  const newTime = s.timeRemaining - 1;
  if (newTime > 0) {
    return { next: { mode: 'phase', stepIndex: s.stepIndex, timeRemaining: newTime }, event: 'tick' };
  }
  const nextIdx = s.stepIndex + 1;
  if (nextIdx >= steps.length) {
    return { next: { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 }, event: 'complete' };
  }
  return {
    next: { mode: 'phase', stepIndex: nextIdx, timeRemaining: steps[nextIdx].duration },
    event: 'phase-start',
  };
}

/** Jump to a step and (re)start it from its full duration. */
export function goToStep(steps: PhaseStep[], idx: number): PlaybackState {
  const step = steps[idx];
  return { mode: 'phase', stepIndex: idx, timeRemaining: step ? step.duration : 0 };
}

/**
 * Skip forward: start the next step, or complete the workout if the active step
 * is the last one. Never lands past the sequence.
 */
export function skipPlayback(
  steps: PhaseStep[],
  s: PlaybackState,
): { next: PlaybackState; event: 'phase-start' | 'complete' } {
  const nextIdx = s.stepIndex + 1;
  if (nextIdx >= steps.length) {
    return { next: { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 }, event: 'complete' };
  }
  return { next: goToStep(steps, nextIdx), event: 'phase-start' };
}

/**
 * Where the back control lands, music-player style: restart the current step, or
 * — if we are only within `thresholdSeconds` of its start — jump to the previous
 * step. On the first step there is nowhere to go back to, so it always restarts.
 * Returns an index that is always a valid step (never negative).
 */
export function backTargetIndex(
  s: PlaybackState,
  currentDuration: number,
  thresholdSeconds: number,
): number {
  const elapsed = currentDuration - s.timeRemaining;
  const goPrevious = s.stepIndex > 0 && elapsed <= thresholdSeconds;
  return goPrevious ? s.stepIndex - 1 : s.stepIndex;
}

/** Seconds of the whole workout already played at this position. */
export function elapsedSeconds(steps: PhaseStep[], s: PlaybackState): number {
  const base = steps.slice(0, s.stepIndex).reduce((sum, st) => sum + st.duration, 0);
  const cur = steps[s.stepIndex];
  const extra =
    s.mode === 'complete'
      ? cur?.duration ?? 0
      : cur
        ? cur.duration - s.timeRemaining
        : 0;
  return base + extra;
}

/** Whole-workout seconds still to play, floored at zero. */
export function totalRemaining(totalDuration: number, elapsed: number): number {
  return Math.max(0, totalDuration - elapsed);
}

/** Progress as a 0..1 fraction of the whole workout. */
export function progressFraction(totalDuration: number, elapsed: number): number {
  return totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 0;
}
