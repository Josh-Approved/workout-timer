/**
 * The workout clock — how much workout time has elapsed, kept on a real clock
 * (live-timer's `nowMs`, which runs through sleep and never jumps) instead of
 * by counting ticks. Pure functions of a tiny state and the current reading,
 * so pausing, seeking and resuming can't lose or invent time, and the screen's
 * wake-ups only sample it (utils/playback `catchUpPlayback`).
 *
 * Running: elapsed = now - anchorMs. Paused: elapsed is frozen, to the
 * millisecond, so a pause part-way through a second resumes part-way through it.
 */

export type WorkoutClock =
  | { running: true; anchorMs: number }
  | { running: false; elapsedMs: number };

export function clockElapsed(c: WorkoutClock, nowMs: number): number {
  return c.running ? nowMs - c.anchorMs : c.elapsedMs;
}

/** A clock running from `elapsedMs` of workout time at reading `nowMs`. */
export function runningAt(nowMs: number, elapsedMs = 0): WorkoutClock {
  return { running: true, anchorMs: nowMs - elapsedMs };
}

export function pauseClock(c: WorkoutClock, nowMs: number): WorkoutClock {
  return c.running ? { running: false, elapsedMs: nowMs - c.anchorMs } : c;
}

export function resumeClock(c: WorkoutClock, nowMs: number): WorkoutClock {
  return c.running ? c : runningAt(nowMs, c.elapsedMs);
}

/** Jump to `elapsedMs` of workout time, staying paused or running as before. */
export function seekClock(c: WorkoutClock, nowMs: number, elapsedMs: number): WorkoutClock {
  return c.running ? runningAt(nowMs, elapsedMs) : { running: false, elapsedMs };
}

/**
 * Milliseconds until the clock next crosses a whole workout second — when the
 * screen should wake. Never less than 1, so a wake that lands exactly on a
 * boundary still schedules forward.
 */
export function msToNextSecond(c: WorkoutClock, nowMs: number): number {
  const into = ((clockElapsed(c, nowMs) % 1000) + 1000) % 1000;
  return Math.max(1, 1000 - into);
}
