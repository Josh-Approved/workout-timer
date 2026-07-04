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
