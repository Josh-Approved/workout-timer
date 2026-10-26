/**
 * The class timeline (class/timeline.ts): every phone's position is a pure
 * function of the start, the instructor's commands and the class time — the
 * property that keeps a class in step through late messages, reconnects and
 * late joins.
 */

import type { PhaseStep } from '../../types';
import { positionAt } from '../../utils/playback';
import {
  newTimeline,
  classClockAt,
  classPositionAt,
  nextCommand,
  toggleClassPause,
  classSkip,
  classBack,
  classIsOver,
  COMMAND_LEAD_MS,
  RESUME_LEAD_MS,
  type ClassTimeline,
} from '../timeline';

// 10s work, 5s rest, 10s work.
const STEPS: PhaseStep[] = [
  { phase: 'exercise', duration: 10 },
  { phase: 'rest', duration: 5 },
  { phase: 'exercise', duration: 10 },
];
const START = 50_000;

describe('classClockAt', () => {
  it('is gathering before the start, counting down', () => {
    const c = classClockAt(STEPS, newTimeline(START), START - 4_000);
    expect(c).toMatchObject({ started: false, running: false, elapsedMs: -4_000 });
    expect(classPositionAt(STEPS, newTimeline(START), START - 4_000)).toEqual(positionAt(STEPS, 0));
  });

  it('runs from the start with no commands', () => {
    expect(classClockAt(STEPS, newTimeline(START), START + 12_345)).toMatchObject({
      started: true,
      running: true,
      elapsedMs: 12_345,
    });
  });

  it('replays pauses and resumes exactly', () => {
    const tl: ClassTimeline = {
      startAt: START,
      seq: 2,
      commands: [
        { at: START + 3_000, action: 'pause' },
        { at: START + 60_000, action: 'resume' },
      ],
    };
    expect(classClockAt(STEPS, tl, START + 30_000)).toMatchObject({ running: false, elapsedMs: 3_000 });
    expect(classClockAt(STEPS, tl, START + 61_500)).toMatchObject({ running: true, elapsedMs: 4_500 });
  });

  it('a jump restarts that step and is counted, so phones know to announce it', () => {
    const tl: ClassTimeline = { startAt: START, seq: 1, commands: [{ at: START + 2_000, action: 'goto', step: 2 }] };
    const c = classClockAt(STEPS, tl, START + 2_500);
    expect(c.elapsedMs).toBe(15_500);
    expect(c.jumps).toBe(1);
    expect(classPositionAt(STEPS, tl, START + 2_500)).toEqual({ mode: 'phase', stepIndex: 2, timeRemaining: 10 });
  });

  it('a jump past the last step finishes the class', () => {
    const tl: ClassTimeline = { startAt: START, seq: 1, commands: [{ at: START + 1_000, action: 'goto', step: 3 }] };
    expect(classIsOver(STEPS, tl, START + 1_000)).toBe(true);
  });

  it('ignores command order on the wire', () => {
    const a: ClassTimeline = {
      startAt: START,
      seq: 2,
      commands: [
        { at: START + 5_000, action: 'resume' },
        { at: START + 1_000, action: 'pause' },
      ],
    };
    expect(classClockAt(STEPS, a, START + 6_000).elapsedMs).toBe(2_000);
  });
});

describe('the instructor controls', () => {
  it('pause lands one lead from now, resume counts in', () => {
    const t0 = START + 4_000;
    const paused = toggleClassPause(STEPS, newTimeline(START), t0);
    expect(paused.seq).toBe(1);
    expect(nextCommand(paused, t0)).toEqual({ at: t0 + COMMAND_LEAD_MS, action: 'pause' });
    const t1 = t0 + 20_000;
    const resumed = toggleClassPause(STEPS, paused, t1);
    expect(nextCommand(resumed, t1)).toEqual({ at: t1 + RESUME_LEAD_MS, action: 'resume' });
    // Running time: the 4 s before the tap + the lead, then nothing until the count-in ends.
    expect(classClockAt(STEPS, resumed, t1 + RESUME_LEAD_MS + 500).elapsedMs).toBe(4_000 + COMMAND_LEAD_MS + 500);
  });

  it('a double tap queues a resume after the pending pause, not a second pause', () => {
    const t0 = START + 4_000;
    const once = toggleClassPause(STEPS, newTimeline(START), t0);
    const twice = toggleClassPause(STEPS, once, t0 + 100);
    expect(twice.commands.map((c) => c.action)).toEqual(['pause', 'resume']);
    expect(twice.commands[1].at).toBeGreaterThan(twice.commands[0].at);
  });

  it('skip jumps to the step after where the class will be when it lands', () => {
    const tl = classSkip(STEPS, newTimeline(START), START + 9_500); // lands in the rest
    expect(tl.commands[0]).toMatchObject({ action: 'goto', step: 2 });
  });

  it('back restarts the step, or goes to the previous one right after a start', () => {
    expect(classBack(STEPS, newTimeline(START), START + 12_000, 1).commands[0]).toMatchObject({ step: 1 });
    expect(classBack(STEPS, newTimeline(START), START + 10_000 - COMMAND_LEAD_MS, 1).commands[0]).toMatchObject({
      step: 0,
    });
  });

  it('does nothing once the class is over', () => {
    const tl = newTimeline(START);
    expect(classSkip(STEPS, tl, START + 99_000)).toBe(tl);
  });
});
