/**
 * Characterisation tests for the playback engine extracted from
 * ActiveWorkoutScreen (utils/playback.ts). These pin the exact run/skip/back/
 * elapsed behaviour the screen used to compute inline, so the extraction can't
 * drift what the user hears and sees. The intent fuzzer (intentFuzz.test.ts)
 * then hammers the same functions with thousands of random stories.
 */

import type { PhaseStep } from '../../types';
import {
  initialPlayback,
  advancePlayback,
  goToStep,
  skipPlayback,
  backTargetIndex,
  elapsedSeconds,
  totalRemaining,
  progressFraction,
  positionAt,
  stepStartSeconds,
  catchUpPlayback,
} from '../playback';

// A tiny three-step workout: 2s work, 2s rest, 2s work.
const STEPS: PhaseStep[] = [
  { phase: 'exercise', duration: 2, setNumber: 1, cycleNumber: 1 },
  { phase: 'rest', duration: 2, setNumber: 1, cycleNumber: 1 },
  { phase: 'exercise', duration: 2, setNumber: 2, cycleNumber: 1 },
];

describe('initialPlayback', () => {
  it('starts at step 0 with its full duration', () => {
    expect(initialPlayback(STEPS)).toEqual({ mode: 'phase', stepIndex: 0, timeRemaining: 2 });
  });
  it('is safe on an empty sequence', () => {
    expect(initialPlayback([])).toEqual({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  });
});

describe('advancePlayback', () => {
  it('ticks down within a step', () => {
    expect(advancePlayback(STEPS, { mode: 'phase', stepIndex: 0, timeRemaining: 2 })).toEqual({
      next: { mode: 'phase', stepIndex: 0, timeRemaining: 1 },
      event: 'tick',
    });
  });
  it('starts the next step at its full duration when the current one runs out', () => {
    expect(advancePlayback(STEPS, { mode: 'phase', stepIndex: 0, timeRemaining: 1 })).toEqual({
      next: { mode: 'phase', stepIndex: 1, timeRemaining: 2 },
      event: 'phase-start',
    });
  });
  it('completes when the final step runs out', () => {
    expect(advancePlayback(STEPS, { mode: 'phase', stepIndex: 2, timeRemaining: 1 })).toEqual({
      next: { mode: 'complete', stepIndex: 2, timeRemaining: 0 },
      event: 'complete',
    });
  });
});

describe('skipPlayback', () => {
  it('jumps to the next step at full duration', () => {
    expect(skipPlayback(STEPS, { mode: 'phase', stepIndex: 0, timeRemaining: 1 })).toEqual({
      next: { mode: 'phase', stepIndex: 1, timeRemaining: 2 },
      event: 'phase-start',
    });
  });
  it('completes when skipping the last step', () => {
    expect(skipPlayback(STEPS, { mode: 'phase', stepIndex: 2, timeRemaining: 2 })).toEqual({
      next: { mode: 'complete', stepIndex: 2, timeRemaining: 0 },
      event: 'complete',
    });
  });
});

describe('backTargetIndex — music-player back control', () => {
  const s = (stepIndex: number, timeRemaining: number) =>
    ({ mode: 'phase' as const, stepIndex, timeRemaining });
  // elapsed-in-step = duration − timeRemaining; step of 2s, threshold 1s.
  it('restarts the current step once past the threshold', () => {
    expect(backTargetIndex(s(1, 0), 2, 1)).toBe(1); // 2s elapsed > 1 → restart
  });
  it('jumps to the previous step only within the threshold', () => {
    expect(backTargetIndex(s(1, 2), 2, 1)).toBe(0); // 0s elapsed ≤ 1 → previous
    expect(backTargetIndex(s(1, 1), 2, 1)).toBe(0); // 1s elapsed ≤ 1 → previous
  });
  it('always restarts on the first step (nowhere to go back to)', () => {
    expect(backTargetIndex(s(0, 2), 2, 1)).toBe(0);
    expect(backTargetIndex(s(0, 0), 2, 1)).toBe(0);
  });
});

describe('goToStep', () => {
  it('restarts a step at its full duration', () => {
    expect(goToStep(STEPS, 2)).toEqual({ mode: 'phase', stepIndex: 2, timeRemaining: 2 });
  });
});

describe('elapsed / remaining / progress derivations', () => {
  it('elapsed sums prior steps plus progress into the current one', () => {
    // At step 1 (rest) with 1s left of 2: 2 (step0) + (2-1) = 3.
    expect(elapsedSeconds(STEPS, { mode: 'phase', stepIndex: 1, timeRemaining: 1 })).toBe(3);
  });
  it('elapsed counts the whole workout once complete', () => {
    expect(elapsedSeconds(STEPS, { mode: 'complete', stepIndex: 2, timeRemaining: 0 })).toBe(6);
  });
  it('total remaining floors at zero and progress is bounded 0..1', () => {
    expect(totalRemaining(6, 3)).toBe(3);
    expect(totalRemaining(6, 9)).toBe(0);
    expect(progressFraction(6, 3)).toBe(0.5);
    expect(progressFraction(6, 9)).toBe(1);
    expect(progressFraction(0, 0)).toBe(0);
  });
});

describe('stepStartSeconds', () => {
  it('is the sum of the steps before it', () => {
    expect(stepStartSeconds(STEPS, 0)).toBe(0);
    expect(stepStartSeconds(STEPS, 2)).toBe(4);
    expect(stepStartSeconds(STEPS, 3)).toBe(6); // the end of the workout
  });
});

describe('positionAt — the position is a function of elapsed time', () => {
  it('matches one advancePlayback per elapsed second, the whole way through', () => {
    let s = initialPlayback(STEPS);
    for (let sec = 0; sec < 6; sec++) {
      expect(positionAt(STEPS, sec * 1000)).toEqual(s);
      expect(positionAt(STEPS, sec * 1000 + 999)).toEqual(s); // a second is a second
      s = advancePlayback(STEPS, s).next;
    }
    expect(positionAt(STEPS, 6000)).toEqual(s);
    expect(s.mode).toBe('complete');
  });
  it('agrees with goToStep at every step start', () => {
    STEPS.forEach((_, i) => {
      expect(positionAt(STEPS, stepStartSeconds(STEPS, i) * 1000)).toEqual(goToStep(STEPS, i));
    });
  });
  it('is complete past the end, and at the top before it', () => {
    expect(positionAt(STEPS, 60_000).mode).toBe('complete');
    expect(positionAt(STEPS, -500)).toEqual(initialPlayback(STEPS));
  });
});

describe('catchUpPlayback — a wake plays the second it crossed', () => {
  const at0 = initialPlayback(STEPS);
  it('does nothing on an early wake', () => {
    expect(catchUpPlayback(STEPS, at0, 999)).toBeNull();
  });
  it('plays exactly one second on an on-time wake', () => {
    const r = catchUpPlayback(STEPS, at0, 1004)!;
    expect(r.event).toBe('tick');
    expect(r.from).toEqual(at0);
    expect(r.next).toEqual(positionAt(STEPS, 1000));
    expect(r.jumped).toBe(false);
  });
  it('after a stall, lands on time and plays only the last second', () => {
    // Stalled for 3.4 s from the top: the in-between seconds pass silently.
    const r = catchUpPlayback(STEPS, at0, 3400)!;
    expect(r.next).toEqual(positionAt(STEPS, 3000));
    expect(r.from).toEqual(positionAt(STEPS, 2000));
    expect(r.event).toBe('tick');
    expect(r.jumped).toBe(true); // crossed from the first step into the rest
  });
  it('a stall over a boundary still reports that boundary as the played second', () => {
    const r = catchUpPlayback(STEPS, at0, 2100)!;
    expect(r.event).toBe('phase-start');
    expect(r.next).toEqual(goToStep(STEPS, 1));
  });
  it('finishes once, measured from the last second, however late the wake', () => {
    const r = catchUpPlayback(STEPS, at0, 90_000)!;
    expect(r.event).toBe('complete');
    expect(r.from).toEqual(positionAt(STEPS, 5000));
    expect(catchUpPlayback(STEPS, r.next, 95_000)).toBeNull();
  });
});
