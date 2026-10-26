/**
 * Class mode's shared timeline — everything phones in a class agree on once
 * they've scanned in: when the workout started, and the instructor's pause /
 * resume / jump commands. Every time is CLASS TIME: the instructor's workout
 * clock (live-timer `nowMs`), which each phone reaches through its own offset
 * (class/clockSync).
 *
 * A phone's position is a pure function of (steps, timeline, class time now):
 * replay the commands, then utils/playback `positionAt`. So a command that
 * arrives late, a phone that reconnects, a late joiner and a relaunched app
 * all land on the same point with nothing to reconcile — the newest timeline
 * (highest `seq`) simply replaces the old one.
 *
 * Commands are stamped a little in the FUTURE (`COMMAND_LEAD_MS`), long enough
 * for the relay to carry them, so every phone — the instructor's included —
 * acts at the same instant instead of each acting when the message lands.
 */

import type { PhaseStep } from '../types';
import { positionAt, stepStartSeconds, backTargetIndex, type PlaybackState } from '../utils/playback';

export type ClassCommand =
  | { at: number; action: 'pause' }
  | { at: number; action: 'resume' }
  /** Jump to the start of `step`; `steps.length` means the end (finish). */
  | { at: number; action: 'goto'; step: number };

export interface ClassTimeline {
  /** Class time the workout's first second starts. */
  startAt: number;
  /** Bumped on every command; the highest wins wherever copies race. */
  seq: number;
  commands: ClassCommand[];
}

/** How far ahead a pause / skip / back is stamped, so it lands everywhere at once. */
export const COMMAND_LEAD_MS = 1200;
/** A resume counts everyone back in ("3, 2, 1") on every phone. */
export const RESUME_LEAD_MS = 3000;

/** Where the class's workout clock stands at one class-time moment. */
export interface ClassClock {
  /** False before `startAt` (the class is still gathering). */
  started: boolean;
  running: boolean;
  /** Workout time elapsed; negative before the start (minus the wait left). */
  elapsedMs: number;
  /** How many jumps have taken effect — a change means "restart here, announce it". */
  jumps: number;
}

export function newTimeline(startAt: number): ClassTimeline {
  return { startAt: Math.round(startAt), seq: 0, commands: [] };
}

function inOrder(tl: ClassTimeline): ClassCommand[] {
  return tl.commands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.at - b.c.at || a.i - b.i)
    .map((x) => x.c);
}

export function classClockAt(steps: PhaseStep[], tl: ClassTimeline, classNow: number): ClassClock {
  if (classNow < tl.startAt) {
    return { started: false, running: false, elapsedMs: classNow - tl.startAt, jumps: 0 };
  }
  const end = steps.length;
  let running = true;
  let elapsed = 0;
  let t = tl.startAt;
  let jumps = 0;
  for (const c of inOrder(tl)) {
    if (c.at > classNow) break;
    const at = Math.max(c.at, tl.startAt);
    if (running) elapsed += at - t;
    t = at;
    if (c.action === 'pause') running = false;
    else if (c.action === 'resume') running = true;
    else {
      elapsed = stepStartSeconds(steps, Math.max(0, Math.min(end, Math.floor(c.step)))) * 1000;
      jumps += 1;
    }
  }
  if (running) elapsed += classNow - t;
  return { started: true, running, elapsedMs: elapsed, jumps };
}

/** The class's position at a class-time moment (the start position while gathering). */
export function classPositionAt(steps: PhaseStep[], tl: ClassTimeline, classNow: number): PlaybackState {
  return positionAt(steps, Math.max(0, classClockAt(steps, tl, classNow).elapsedMs));
}

/** The next command still to take effect after `classNow` (what the screen is counting down to). */
export function nextCommand(tl: ClassTimeline, classNow: number): ClassCommand | null {
  return inOrder(tl).find((c) => c.at > classNow) ?? null;
}

// ---------------------------------------------------------------------------
// The instructor's controls. Each returns the new timeline; the caller
// publishes it. A control acts on what the instructor sees when they tap —
// or, with commands still in flight, on where those will have left the
// class — and lands a lead later.
// ---------------------------------------------------------------------------

function append(tl: ClassTimeline, cmd: ClassCommand): ClassTimeline {
  return { ...tl, seq: tl.seq + 1, commands: [...tl.commands, cmd] };
}

/** When a new command lands: the lead from now, and never before one already queued. */
function landingAt(tl: ClassTimeline, classNow: number, lead: number): number {
  const last = tl.commands.reduce((m, c) => Math.max(m, c.at), tl.startAt);
  return Math.round(Math.max(classNow + lead, last + 1));
}

/** The moment a new control decides from: now, or the last command still in flight. */
function decidingAt(tl: ClassTimeline, classNow: number): number {
  return tl.commands.reduce((m, c) => Math.max(m, c.at), classNow);
}

/** Pause the class if it is (about to be) running, otherwise count it back in. */
export function toggleClassPause(steps: PhaseStep[], tl: ClassTimeline, classNow: number): ClassTimeline {
  const settled = classClockAt(steps, tl, landingAt(tl, classNow, 0));
  if (settled.running) return append(tl, { at: landingAt(tl, classNow, COMMAND_LEAD_MS), action: 'pause' });
  return append(tl, { at: landingAt(tl, classNow, RESUME_LEAD_MS), action: 'resume' });
}

/**
 * Skip the class to the step after the one the instructor is looking at (or
 * the end). Decided at the tap, not at landing: a skip in a step's last
 * second must not also skip the step that begins during the lead.
 */
export function classSkip(steps: PhaseStep[], tl: ClassTimeline, classNow: number): ClassTimeline {
  const from = decidingAt(tl, classNow);
  const there = classPositionAt(steps, tl, from);
  if (there.mode === 'complete') return tl;
  const at = landingAt(tl, classNow, COMMAND_LEAD_MS);
  // A step that ends on its own before the skip could land needs no skip:
  // sending one would restart the next step a moment after it began.
  const clock = classClockAt(steps, tl, from);
  const endsAt = from + stepStartSeconds(steps, there.stepIndex + 1) * 1000 - clock.elapsedMs;
  if (clock.running && endsAt <= at) return tl;
  return append(tl, { at, action: 'goto', step: there.stepIndex + 1 });
}

/** End the class's workout on every phone (the instructor's Finish in AMRAP / For Time). */
export function classFinish(steps: PhaseStep[], tl: ClassTimeline, classNow: number): ClassTimeline {
  if (classPositionAt(steps, tl, decidingAt(tl, classNow)).mode === 'complete') return tl;
  return append(tl, { at: landingAt(tl, classNow, COMMAND_LEAD_MS), action: 'goto', step: steps.length });
}

/** Back control for the class, music-player style (utils/playback `backTargetIndex`). */
export function classBack(
  steps: PhaseStep[],
  tl: ClassTimeline,
  classNow: number,
  thresholdSeconds: number,
): ClassTimeline {
  const there = classPositionAt(steps, tl, decidingAt(tl, classNow));
  if (there.mode === 'complete') return tl;
  const step = steps[there.stepIndex];
  if (!step) return tl;
  return append(tl, {
    at: landingAt(tl, classNow, COMMAND_LEAD_MS),
    action: 'goto',
    step: backTargetIndex(there, step.duration, thresholdSeconds),
  });
}

/** Whether the class's workout has finished by this class-time moment. */
export function classIsOver(steps: PhaseStep[], tl: ClassTimeline, classNow: number): boolean {
  return classPositionAt(steps, tl, classNow).mode === 'complete' && classClockAt(steps, tl, classNow).started;
}
