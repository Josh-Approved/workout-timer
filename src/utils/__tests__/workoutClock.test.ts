/**
 * The workout clock (utils/workoutClock.ts): elapsed workout time kept on a
 * real clock. Pausing, seeking and resuming must never lose or invent time —
 * the property that keeps a solo timer honest and two class phones together.
 */

import {
  clockElapsed,
  runningAt,
  pauseClock,
  resumeClock,
  seekClock,
  msToNextSecond,
} from '../workoutClock';

describe('workout clock', () => {
  it('runs with real time from its start', () => {
    const c = runningAt(10_000);
    expect(clockElapsed(c, 10_000)).toBe(0);
    expect(clockElapsed(c, 13_250)).toBe(3_250);
  });

  it('freezes to the millisecond while paused', () => {
    const paused = pauseClock(runningAt(0), 2_600);
    expect(clockElapsed(paused, 50_000)).toBe(2_600);
    expect(pauseClock(paused, 99_999)).toBe(paused); // pausing twice changes nothing
  });

  it('twenty pause/resume cycles add no time at all', () => {
    let c = runningAt(0);
    let now = 0;
    let ran = 0;
    for (let i = 0; i < 20; i++) {
      now += 737; // run part-way through a second
      ran += 737;
      c = pauseClock(c, now);
      now += 4_111; // paused time never counts
      c = resumeClock(c, now);
    }
    expect(clockElapsed(c, now)).toBe(ran);
  });

  it('seeks while running or paused, keeping that state', () => {
    const running = seekClock(runningAt(0), 5_000, 12_000);
    expect(running.running).toBe(true);
    expect(clockElapsed(running, 6_000)).toBe(13_000);
    const paused = seekClock(pauseClock(runningAt(0), 5_000), 9_000, 12_000);
    expect(clockElapsed(paused, 20_000)).toBe(12_000);
  });

  it('wakes on the next whole workout second, never zero ms out', () => {
    const c = runningAt(100);
    expect(msToNextSecond(c, 100)).toBe(1000);
    expect(msToNextSecond(c, 350)).toBe(750);
    expect(msToNextSecond(c, 1_099)).toBe(1);
    expect(msToNextSecond(c, 1_100)).toBe(1000);
  });
});
