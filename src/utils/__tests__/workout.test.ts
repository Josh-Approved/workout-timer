/**
 * The interval/rest sequencing is the trust core — these tests pin the worked
 * examples the timer promises (the exact phase list a workout plays, and the
 * total duration derived from it). A refactor of buildWorkoutSequence that
 * silently drops the last rest, double-counts a recovery, or mis-orders
 * warm-up/cool-down would change what the user actually hears and sees; these
 * are the cases that catch it.
 */

import type { TimerConfig, PhaseStep } from '../../types';
import {
  buildWorkoutSequence,
  getTotalDuration,
  formatTime,
  formatDurationSpoken,
  buildPhaseAnnouncement,
  getTimerSummary,
  generateId,
} from '../workout';
import { QA_TIMERS } from '../../qa/fixtures';

let seq = 0;
const t = () => ++seq;

/** A timer with everything off except the fields a test sets — so each test
 *  isolates exactly one part of the sequence. */
function timer(p: Partial<TimerConfig> = {}): TimerConfig {
  return {
    id: `tc${t()}`,
    name: 'Test',
    initialCountdown: 0,
    warmUp: 0,
    exercise: 30,
    rest: 0,
    sets: 1,
    recovery: 0,
    cycles: 1,
    coolDown: 0,
    createdAt: t(),
    updatedAt: t(),
    ...p,
  };
}

const phases = (steps: PhaseStep[]) => steps.map((s) => s.phase);

describe('buildWorkoutSequence — phase ordering', () => {
  it('lays warm-up/work/rest/recovery/cool-down in the right order', () => {
    const steps = buildWorkoutSequence(
      timer({
        initialCountdown: 5,
        warmUp: 60,
        exercise: 20,
        rest: 10,
        sets: 2,
        recovery: 30,
        cycles: 2,
        coolDown: 40,
      }),
    );
    // initial, warm, [cycle1: ex,rest,ex,rest, recovery], [cycle2: ex,rest,ex], cool
    expect(phases(steps)).toEqual([
      'initial_countdown',
      'warm_up',
      'exercise',
      'rest',
      'exercise',
      'rest',
      'recovery',
      'exercise',
      'rest',
      'exercise',
      'cool_down',
    ]);
  });

  it('omits warm-up, initial countdown and cool-down when they are zero', () => {
    const steps = buildWorkoutSequence(
      timer({ initialCountdown: 0, warmUp: 0, coolDown: 0, exercise: 20, sets: 3, rest: 5 }),
    );
    expect(phases(steps)).toEqual(['exercise', 'rest', 'exercise', 'rest', 'exercise']);
  });
});

describe('buildWorkoutSequence — the no-trailing-rest invariant', () => {
  it('never appends a rest after the very last exercise (single cycle)', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 20, rest: 10, sets: 4, cycles: 1 }));
    // 4 exercises, only 3 rests — no dangling rest at the end.
    expect(steps.filter((s) => s.phase === 'exercise')).toHaveLength(4);
    expect(steps.filter((s) => s.phase === 'rest')).toHaveLength(3);
    expect(steps[steps.length - 1].phase).toBe('exercise');
  });

  it('keeps the rest after the last set of a non-final cycle', () => {
    // Two cycles: the rest after cycle 1's last set IS kept (it is not the
    // final set of the final cycle); only cycle 2's last rest is dropped.
    const steps = buildWorkoutSequence(timer({ exercise: 20, rest: 10, sets: 2, cycles: 2, recovery: 0 }));
    // cycle1: ex,rest,ex,rest  cycle2: ex,rest,ex
    expect(phases(steps)).toEqual(['exercise', 'rest', 'exercise', 'rest', 'exercise', 'rest', 'exercise']);
    expect(steps.filter((s) => s.phase === 'rest')).toHaveLength(3);
  });

  it('with rest = 0 there are no rest steps at all', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 20, rest: 0, sets: 5, cycles: 1 }));
    expect(steps.every((s) => s.phase === 'exercise')).toBe(true);
    expect(steps).toHaveLength(5);
  });
});

describe('buildWorkoutSequence — recovery between cycles', () => {
  it('inserts recovery between cycles but never after the last cycle', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 20, rest: 0, sets: 1, cycles: 3, recovery: 30 }));
    // ex (cy1) recovery ex (cy2) recovery ex (cy3)  — 2 recoveries for 3 cycles
    expect(phases(steps)).toEqual(['exercise', 'recovery', 'exercise', 'recovery', 'exercise']);
    expect(steps.filter((s) => s.phase === 'recovery')).toHaveLength(2);
  });

  it('with recovery = 0 there are no recovery steps', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 20, sets: 1, cycles: 3, recovery: 0 }));
    expect(steps.every((s) => s.phase === 'exercise')).toBe(true);
    expect(steps).toHaveLength(3);
  });
});

describe('buildWorkoutSequence — set/cycle bookkeeping', () => {
  it('tags each exercise/rest with its 1-based set and cycle number', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 20, rest: 10, sets: 2, cycles: 2, recovery: 5 }));
    const ex = steps.filter((s) => s.phase === 'exercise');
    expect(ex.map((s) => [s.cycleNumber, s.setNumber])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ]);
    const recovery = steps.find((s) => s.phase === 'recovery');
    expect(recovery?.cycleNumber).toBe(1); // recovery is tagged with the cycle it follows
  });
});

describe('buildWorkoutSequence — degenerate inputs', () => {
  it('zero cycles yields an empty work block (only framing phases survive)', () => {
    const steps = buildWorkoutSequence(timer({ cycles: 0, exercise: 20, sets: 4, warmUp: 30, coolDown: 30 }));
    // No cycles → no exercise/rest/recovery at all; just warm-up + cool-down.
    expect(phases(steps)).toEqual(['warm_up', 'cool_down']);
  });

  it('zero sets yields no exercises even with cycles > 0', () => {
    const steps = buildWorkoutSequence(timer({ cycles: 3, sets: 0, exercise: 20, recovery: 15 }));
    expect(steps.filter((s) => s.phase === 'exercise')).toHaveLength(0);
    // recovery still falls between the (empty) cycles: 2 for 3 cycles.
    expect(steps.filter((s) => s.phase === 'recovery')).toHaveLength(2);
  });

  it('a single set, single cycle is just one exercise', () => {
    const steps = buildWorkoutSequence(timer({ exercise: 25, rest: 10, sets: 1, cycles: 1 }));
    expect(steps).toEqual([{ phase: 'exercise', duration: 25, setNumber: 1, cycleNumber: 1 }]);
  });
});

describe('getTotalDuration — duration is the sum of the played sequence', () => {
  it('matches the worked total for the seeded Standard Tabata', () => {
    // QA Standard Tabata: countdown 10, no warm, 20s work, 10s rest, 8 sets,
    // 1 cycle, 60s cool. 8 work + 7 rest (last rest dropped):
    //   10 + 8*20 + 7*10 + 60 = 10 + 160 + 70 + 60 = 300
    const tabata = QA_TIMERS.find((x) => x.id === 'qa-tabata')!;
    expect(getTotalDuration(tabata)).toBe(300);
  });

  it('counts recovery between cycles', () => {
    // 2 cycles, 2 sets, 20s work, 10s rest, 30s recovery, no framing:
    //   work 4*20=80, rest 3*10=30 (one dropped at the very end), recovery 1*30=30
    //   total = 140
    const total = getTotalDuration(timer({ exercise: 20, rest: 10, sets: 2, cycles: 2, recovery: 30 }));
    expect(total).toBe(140);
  });

  it('equals the literal sum of every step duration (no hidden phases)', () => {
    const tc = timer({ initialCountdown: 5, warmUp: 60, exercise: 20, rest: 10, sets: 3, cycles: 2, recovery: 30, coolDown: 40 });
    const steps = buildWorkoutSequence(tc);
    const handSum = steps.reduce((s, p) => s + p.duration, 0);
    expect(getTotalDuration(tc)).toBe(handSum);
  });

  it('is zero for a workout with no phases (zero cycles, no framing)', () => {
    expect(getTotalDuration(timer({ cycles: 0, warmUp: 0, coolDown: 0, initialCountdown: 0 }))).toBe(0);
  });
});

describe('formatTime — mm:ss clock', () => {
  it('zero-pads minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('renders durations over an hour as raw minutes (no hours field)', () => {
    expect(formatTime(3661)).toBe('61:01');
  });
});

describe('formatDurationSpoken — natural-language duration', () => {
  it('singularizes one second / one minute', () => {
    expect(formatDurationSpoken(1)).toBe('1 second');
    expect(formatDurationSpoken(60)).toBe('1 minute');
  });

  it('pluralizes and joins minutes and seconds', () => {
    expect(formatDurationSpoken(20)).toBe('20 seconds');
    expect(formatDurationSpoken(90)).toBe('1 minute and 30 seconds');
    expect(formatDurationSpoken(125)).toBe('2 minutes and 5 seconds');
  });

  it('drops the seconds clause on a whole number of minutes', () => {
    expect(formatDurationSpoken(120)).toBe('2 minutes');
  });
});

describe('buildPhaseAnnouncement — spoken phase cues', () => {
  it('adds set context for exercise, and cycle context when there is more than one cycle', () => {
    const step: PhaseStep = { phase: 'exercise', duration: 20, setNumber: 2, cycleNumber: 1 };
    expect(buildPhaseAnnouncement(step, 8, 1)).toBe('Exercise, set 2 of 8, 20 seconds');
    expect(buildPhaseAnnouncement(step, 8, 4)).toBe('Exercise, set 2 of 8, cycle 1 of 4, 20 seconds');
  });

  it('describes a recovery by the cycle it follows', () => {
    const step: PhaseStep = { phase: 'recovery', duration: 60, cycleNumber: 1 };
    expect(buildPhaseAnnouncement(step, 0, 3)).toBe('Recovery, after cycle 1 of 3, 1 minute');
  });

  it('falls back to name + duration for framing phases', () => {
    expect(buildPhaseAnnouncement({ phase: 'warm_up', duration: 60 }, 0, 1)).toBe('Warm up, 1 minute');
    expect(buildPhaseAnnouncement({ phase: 'initial_countdown', duration: 10 }, 0, 1)).toBe('Get ready, 10 seconds');
  });
});

describe('getTimerSummary — list-row blurb', () => {
  it('includes work, rest, sets, and cycles only when more than one', () => {
    expect(getTimerSummary(timer({ exercise: 20, rest: 10, sets: 8, cycles: 1 }))).toBe(
      '20 seconds work · 10 seconds rest · 8 sets',
    );
    expect(getTimerSummary(timer({ exercise: 30, rest: 0, sets: 1, cycles: 3 }))).toBe(
      '30 seconds work · 1 set · 3 cycles',
    );
  });

  // The `dur` helper (work/rest phrasing) has two branches: seconds under a
  // minute, whole minutes at or above one. These pin both branches and the
  // exact 60-second boundary so a refactor that drops the minutes branch,
  // mis-rounds it, or flips the singular/plural or boundary comparison is caught.
  it('singularizes a one-second work interval', () => {
    expect(getTimerSummary(timer({ exercise: 1, rest: 0, sets: 1, cycles: 1 }))).toBe(
      '1 second work · 1 set',
    );
  });

  it('switches to whole minutes exactly at 60 seconds', () => {
    // 59s stays in seconds, 60s becomes "1 min" — pins the < 60 boundary.
    expect(getTimerSummary(timer({ exercise: 59, rest: 0, sets: 1, cycles: 1 }))).toBe(
      '59 seconds work · 1 set',
    );
    expect(getTimerSummary(timer({ exercise: 60, rest: 0, sets: 1, cycles: 1 }))).toBe(
      '1 min work · 1 set',
    );
  });

  it('renders minutes for longer work and rest intervals (floored)', () => {
    // 90s → "1 min" (floored, not 1.5), 120s rest → "2 min".
    expect(getTimerSummary(timer({ exercise: 90, rest: 120, sets: 2, cycles: 1 }))).toBe(
      '1 min work · 2 min rest · 2 sets',
    );
  });
});

describe('generateId — unique local id', () => {
  it('returns a non-empty base36 token (letters/digits only, no separators)', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    // Base36 of a timestamp plus a random suffix — no dot, no NaN, no truncation.
    expect(id).toMatch(/^[0-9a-z]+$/);
    expect(id.length).toBeGreaterThan(5);
  });

  it('produces distinct ids on successive calls', () => {
    // Same-millisecond calls still differ via the random suffix (~1-in-60M
    // collision), so a burst stays effectively unique.
    const ids = Array.from({ length: 50 }, () => generateId());
    expect(new Set(ids).size).toBe(ids.length);
  });
});
