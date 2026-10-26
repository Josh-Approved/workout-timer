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
 *
 * Every control restarts a step at its full duration, so a position is also
 * fully described by the workout time elapsed since the top (`positionAt`).
 * The screen keeps that elapsed time on a real clock (utils/workoutClock) and
 * asks where it should be, rather than counting its own ticks — a busy phone
 * or a pause can't make it drift, and two phones that agree on a start stay
 * together.
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

/** Seconds of the workout before step `idx` starts (its start, on the elapsed timeline). */
export function stepStartSeconds(steps: PhaseStep[], idx: number): number {
  let sum = 0;
  for (let i = 0; i < idx && i < steps.length; i++) sum += steps[i].duration;
  return sum;
}

/**
 * The position `elapsedMs` of workout time after the top: the same state that
 * many one-second `advancePlayback` calls from `initialPlayback` reach. Past the
 * end it is `complete`.
 */
export function positionAt(steps: PhaseStep[], elapsedMs: number): PlaybackState {
  if (steps.length === 0) return initialPlayback(steps);
  let sec = Math.max(0, Math.floor(elapsedMs / 1000));
  for (let i = 0; i < steps.length; i++) {
    const d = steps[i].duration;
    if (sec < d) return { mode: 'phase', stepIndex: i, timeRemaining: d - sec };
    sec -= d;
  }
  return { mode: 'complete', stepIndex: steps.length - 1, timeRemaining: 0 };
}

/**
 * Bring the position up to `elapsedMs` of real workout time. A normal wake is
 * one second on and plays as one `advancePlayback` from where we are, cues and
 * all. After a stall (a busy or throttled phone) the seconds in between pass
 * silently and only the last one plays, so a late phone lands on time without a
 * burst of catch-up beeps; `jumped` says that silent part crossed into another
 * step, so the screen can announce where it landed. Returns null when there is
 * nothing to do yet (an early wake, or already complete).
 *
 * `from` is the position the played second starts at — the state a finish is
 * measured from.
 */
export function catchUpPlayback(
  steps: PhaseStep[],
  s: PlaybackState,
  elapsedMs: number,
): { from: PlaybackState; next: PlaybackState; event: PlaybackEvent; jumped: boolean } | null {
  if (s.mode === 'complete' || steps.length === 0) return null;
  const target = Math.floor(elapsedMs / 1000);
  const current = elapsedSeconds(steps, s);
  if (target <= current) return null;
  let from = s;
  if (target - 1 > current) {
    const total = stepStartSeconds(steps, steps.length);
    from = positionAt(steps, (Math.min(target, total) - 1) * 1000);
  }
  const { next, event } = advancePlayback(steps, from);
  return { from, next, event, jumped: from.stepIndex !== s.stepIndex };
}
