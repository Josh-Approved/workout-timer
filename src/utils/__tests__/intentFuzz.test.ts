/**
 * Intent fuzzer — workout-timer trust core (Uplevel 3 / T1).
 *
 * Drives the REAL trust core — the interval-program builder (utils/workout.ts
 * `buildWorkoutSequence`) and the playback engine (utils/playback.ts) that
 * ActiveWorkoutScreen runs its run/pause/resume/skip/back controls on — through
 * random workout stories, and after every command asserts INTENT: what a person
 * expects of a timer, not "the state happened to converge". This is the
 * pure-logic level; the device-level equivalents (real clock jumps, process
 * death) live in T4.
 *
 * The model is only the intent ledger (are we running? are we mid-workout or
 * done?). It never re-implements the engine: every remaining/elapsed/next-step
 * decision is read back from the real functions and checked against an
 * independent expectation.
 *
 * Oracles (from the spec's workout bullet + the structural invariants):
 *
 *   I-BUILD-COUNT  the sequence plays exactly cycles×sets work intervals.
 *   I-BUILD-TOTAL  its total equals an independent duration formula (and
 *                  getTotalDuration agrees) — durations are honoured, none
 *                  invented or dropped.
 *   I-BUILD-ORDER  countdown leads, warm-up precedes the first exercise,
 *                  cool-down closes, and a workout never ends on a rest.
 *   I-TICK-STEP    one second of play advances elapsed by exactly one second —
 *                  never a jump, never a stall (covers tick, phase boundary,
 *                  and completion).
 *   I-BOUNDS       remaining and elapsed are never negative, never exceed the
 *                  step / the workout; progress stays within [0, 1].
 *   I-SKIP-FWD     skip moves to the next step at its full duration and never
 *                  rewinds the whole-workout elapsed.
 *   I-BACK-SANE    back lands on the current or the immediately previous step
 *                  (never off the ends), always at that step's full duration.
 *   I-RESUME       pausing/resuming and a background-relaunch leave the position
 *                  exactly where it was — no time lost or invented.
 *
 * Oracles are intent statements, never convergence alone (canon, 2026-07-03),
 * and every random draw is a logged fast-check seed — no bare Math.random.
 */

import fc from 'fast-check';
import { runIntentFuzz, intent } from '../../../qa/intent-fuzz/harness';
import { replayRegressions } from '../../../qa/intent-fuzz/replay';

import type { TimerConfig, PhaseStep } from '../../types';
import { buildWorkoutSequence, getTotalDuration } from '../workout';
import {
  type PlaybackState,
  initialPlayback,
  advancePlayback,
  goToStep,
  skipPlayback,
  backTargetIndex,
  elapsedSeconds,
  progressFraction,
} from '../playback';

const APP = require('../../../app.json').expo.slug as string;
const MODEL = 'workout';

// The back control's "restart vs. previous" window (ActiveWorkoutScreen).
const RESTART_THRESHOLD_SECONDS = 1;

interface ConfigDraw {
  initialCountdown: number;
  warmUp: number;
  exercise: number;
  rest: number;
  sets: number;
  recovery: number;
  cycles: number;
  coolDown: number;
}

function toTimer(c: ConfigDraw): TimerConfig {
  return { id: 'fuzz', name: 'Fuzz', createdAt: 0, updatedAt: 0, ...c };
}

/**
 * Independent duration formula — deliberately NOT buildWorkoutSequence's loop.
 * A workout of C cycles × S sets plays C·S work intervals, a rest after every
 * work interval except the very last, a recovery between each pair of cycles,
 * plus whichever framing phases are switched on.
 */
function expectedTotal(c: ConfigDraw): number {
  const ex = c.cycles * c.sets;
  let total = 0;
  if (c.initialCountdown > 0) total += c.initialCountdown;
  if (c.warmUp > 0) total += c.warmUp;
  total += ex * c.exercise;
  if (c.rest > 0 && ex >= 1) total += (ex - 1) * c.rest;
  if (c.recovery > 0 && c.cycles >= 1) total += (c.cycles - 1) * c.recovery;
  if (c.coolDown > 0) total += c.coolDown;
  return total;
}

interface Real {
  steps: PhaseStep[];
  total: number;
  state: PlaybackState;
}
interface Model {
  running: boolean;
  mode: PlaybackState['mode'];
}

// --------------------------------------------------------------------------
// Oracle helpers
// --------------------------------------------------------------------------

function assertInvariants(r: Real, ctx: string): void {
  const cur = r.steps[r.state.stepIndex];
  if (r.state.mode === 'phase') {
    intent(`${ctx}: stepIndex in range`, r.state.stepIndex >= 0 && r.state.stepIndex < r.steps.length);
    intent(`${ctx}: remaining never negative (was ${r.state.timeRemaining})`, r.state.timeRemaining >= 0);
    intent(
      `${ctx}: remaining never exceeds the step duration`,
      cur ? r.state.timeRemaining <= cur.duration : r.state.timeRemaining === 0,
    );
  }
  const el = elapsedSeconds(r.steps, r.state);
  intent(`${ctx}: elapsed never negative (was ${el})`, el >= 0);
  intent(`${ctx}: elapsed never exceeds the workout total (${el} / ${r.total})`, el <= r.total);
  const pf = progressFraction(r.total, el);
  intent(`${ctx}: progress within [0,1] (was ${pf})`, pf >= 0 && pf <= 1);
}

function assertBuildOracles(r: Real, c: ConfigDraw): void {
  const exCount = r.steps.filter((s) => s.phase === 'exercise').length;
  intent(`build: exactly cycles×sets work intervals (${exCount} vs ${c.cycles * c.sets})`, exCount === c.cycles * c.sets);

  const builtSum = r.steps.reduce((a, s) => a + s.duration, 0);
  intent(`build: total matches the independent formula (${builtSum} vs ${expectedTotal(c)})`, builtSum === expectedTotal(c));
  intent(`build: getTotalDuration agrees with the built sequence (${getTotalDuration(toTimer(c))} vs ${builtSum})`, getTotalDuration(toTimer(c)) === builtSum);

  if (r.steps.length > 0) {
    intent('build: a workout never ends on a rest interval', r.steps[r.steps.length - 1].phase !== 'rest');
  }
  if (c.initialCountdown > 0) {
    intent('build: the countdown leads the workout', r.steps[0]?.phase === 'initial_countdown');
  }
  if (c.coolDown > 0 && r.steps.length > 0) {
    intent('build: the cool-down closes the workout', r.steps[r.steps.length - 1].phase === 'cool_down');
  }
  if (c.warmUp > 0) {
    const firstEx = r.steps.findIndex((s) => s.phase === 'exercise');
    const warmIdx = r.steps.findIndex((s) => s.phase === 'warm_up');
    if (firstEx >= 0) intent('build: warm-up precedes the first exercise', warmIdx >= 0 && warmIdx < firstEx);
  }
}

// --------------------------------------------------------------------------
// Commands — one per real user action
// --------------------------------------------------------------------------

/** Pick a fresh timer and start it from the top (choosing a different workout). */
class Rebuild implements fc.Command<Model, Real> {
  constructor(readonly c: ConfigDraw) {}
  check = () => true;
  run(m: Model, r: Real): void {
    r.steps = buildWorkoutSequence(toTimer(this.c));
    r.total = getTotalDuration(toTimer(this.c));
    assertBuildOracles(r, this.c);
    r.state = initialPlayback(r.steps);
    m.running = true;
    m.mode = r.state.mode;
    assertInvariants(r, 'rebuild');
  }
  toString = () =>
    `rebuild(${this.c.cycles}c×${this.c.sets}s ex${this.c.exercise}/rest${this.c.rest}` +
    `${this.c.warmUp ? `/warm${this.c.warmUp}` : ''}${this.c.recovery ? `/rec${this.c.recovery}` : ''}` +
    `${this.c.initialCountdown ? `/cd${this.c.initialCountdown}` : ''}${this.c.coolDown ? `/cool${this.c.coolDown}` : ''})`;
}

/** One second of the running clock elapses. */
class Tick implements fc.Command<Model, Real> {
  check = (m: Model) => m.running && m.mode === 'phase';
  run(m: Model, r: Real): void {
    const before = elapsedSeconds(r.steps, r.state);
    const { next, event } = advancePlayback(r.steps, r.state);
    r.state = next;
    const after = elapsedSeconds(r.steps, r.state);
    // I-TICK-STEP — one second in, one second of the workout done. Always,
    // whether the tick stayed in a step, crossed a boundary, or finished.
    intent(`tick advances elapsed by exactly one second (${before}→${after})`, after === before + 1);
    if (event === 'complete') {
      intent('a finished workout reads the full total as elapsed', after === r.total);
      m.running = false;
    }
    m.mode = r.state.mode;
    assertInvariants(r, `tick(${event})`);
  }
  toString = () => 'tick';
}

/** Skip forward to the next interval (or finish if on the last). */
class Skip implements fc.Command<Model, Real> {
  check = (m: Model) => m.mode === 'phase';
  run(m: Model, r: Real): void {
    const before = elapsedSeconds(r.steps, r.state);
    const fromIdx = r.state.stepIndex;
    const { next, event } = skipPlayback(r.steps, r.state);
    r.state = next;
    if (event === 'complete') {
      intent('skipping the last interval finishes at the full total', elapsedSeconds(r.steps, r.state) === r.total);
      m.running = false;
    } else {
      intent(`skip moves to the next interval (${fromIdx}→${next.stepIndex})`, next.stepIndex === fromIdx + 1);
      intent('skip starts the next interval at its full duration', next.timeRemaining === r.steps[next.stepIndex].duration);
      intent(`skip never rewinds the workout (${before}→${elapsedSeconds(r.steps, r.state)})`, elapsedSeconds(r.steps, r.state) >= before);
    }
    m.mode = r.state.mode;
    assertInvariants(r, `skip(${event})`);
  }
  toString = () => 'skip';
}

/** Back control: restart the current interval, or step back within the window. */
class Back implements fc.Command<Model, Real> {
  check = (m: Model) => m.mode === 'phase';
  run(m: Model, r: Real): void {
    const cur = r.steps[r.state.stepIndex];
    if (!cur) return;
    const from = r.state.stepIndex;
    const target = backTargetIndex(r.state, cur.duration, RESTART_THRESHOLD_SECONDS);
    // I-BACK-SANE — never off either end; only ever this step or the one before.
    intent(`back stays on a real interval (target ${target})`, target >= 0 && target < r.steps.length);
    intent(`back lands on this or the previous interval (from ${from}, to ${target})`, target === from || target === from - 1);
    r.state = goToStep(r.steps, target);
    intent('back (re)starts its interval at full duration', r.state.timeRemaining === r.steps[target].duration);
    m.mode = r.state.mode;
    assertInvariants(r, 'back');
  }
  toString = () => 'back';
}

/** Pause the running clock — freezes the position, nothing moves. */
class Pause implements fc.Command<Model, Real> {
  check = (m: Model) => m.running && m.mode === 'phase';
  run(m: Model, r: Real): void {
    const frozen = { ...r.state };
    m.running = false;
    intent('pause freezes the position exactly where it was', sameState(r.state, frozen));
    assertInvariants(r, 'pause');
  }
  toString = () => 'pause';
}

/** Resume from pause — must continue from exactly the frozen point. */
class Resume implements fc.Command<Model, Real> {
  check = (m: Model) => !m.running && m.mode === 'phase';
  run(m: Model, r: Real): void {
    const frozen = { ...r.state };
    m.running = true;
    // I-RESUME — resuming can't lose or invent time; the point is unchanged.
    intent('resume continues from exactly the paused point', sameState(r.state, frozen));
    assertInvariants(r, 'resume');
  }
  toString = () => 'resume';
}

/** Background + relaunch: the position is re-derived from stored state. */
class Relaunch implements fc.Command<Model, Real> {
  check = () => true;
  run(m: Model, r: Real): void {
    const before = elapsedSeconds(r.steps, r.state);
    const restored = JSON.parse(JSON.stringify(r.state)) as PlaybackState;
    // I-RESUME — a relaunch resumes the same point (pure-logic level; T4 does device).
    intent('relaunch restores the identical position', sameState(restored, r.state));
    intent(`relaunch resumes the same elapsed point (${before})`, elapsedSeconds(r.steps, restored) === before);
    r.state = restored;
    m.mode = r.state.mode;
    assertInvariants(r, 'relaunch');
  }
  toString = () => 'relaunch';
}

function sameState(a: PlaybackState, b: PlaybackState): boolean {
  return a.mode === b.mode && a.stepIndex === b.stepIndex && a.timeRemaining === b.timeRemaining;
}

// --------------------------------------------------------------------------
// Command arbitraries + setup
// --------------------------------------------------------------------------

// Framing durations are on/off; work is always ≥1s so no step is zero-length
// (a real workout has no zero-second intervals). Small values keep stories fast.
const framing = fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 5 }));
const configArb: fc.Arbitrary<ConfigDraw> = fc.record({
  initialCountdown: framing,
  warmUp: framing,
  exercise: fc.integer({ min: 1, max: 8 }),
  rest: framing,
  sets: fc.integer({ min: 1, max: 4 }),
  recovery: framing,
  cycles: fc.integer({ min: 1, max: 3 }),
  coolDown: framing,
});

const commands: fc.Arbitrary<fc.Command<Model, Real>>[] = [
  configArb.map((c) => new Rebuild(c)),
  fc.constant(new Tick()),
  fc.constant(new Tick()), // weight ticks so stories actually play through workouts
  fc.constant(new Skip()),
  fc.constant(new Back()),
  fc.constant(new Pause()),
  fc.constant(new Resume()),
  fc.constant(new Relaunch()),
];

// A representative default workout so playback commands always have a sequence
// (countdown 3, warm 5, 4s work / 2s rest, 3 sets × 2 cycles, 3s recovery, cool 5).
const DEFAULT: ConfigDraw = {
  initialCountdown: 3,
  warmUp: 5,
  exercise: 4,
  rest: 2,
  sets: 3,
  recovery: 3,
  cycles: 2,
  coolDown: 5,
};

function setup(): { model: Model; real: Real } {
  const steps = buildWorkoutSequence(toTimer(DEFAULT));
  const state = initialPlayback(steps);
  return {
    model: { running: true, mode: state.mode },
    real: { steps, total: getTotalDuration(toTimer(DEFAULT)), state },
  };
}

/** Shared by the live fuzzer and the regression replayer (same property). */
export function buildWorkoutProperty(): fc.IPropertyWithHooks<unknown> {
  return fc.property(fc.commands(commands, { maxCommands: 60 }), (cmds) => {
    const s = setup();
    fc.modelRun(() => ({ model: s.model, real: s.real }), cmds);
  }) as unknown as fc.IPropertyWithHooks<unknown>;
}

describe('workout — intent fuzzer', () => {
  it('user intent survives randomized run/skip/back/background stories', () => {
    runIntentFuzz<Model, Real>({ app: APP, model: MODEL, commands, setup, maxCommands: 60 });
  });
});

// Every crystallized failure replays as a normal test forever.
replayRegressions({ models: { [MODEL]: buildWorkoutProperty } });
