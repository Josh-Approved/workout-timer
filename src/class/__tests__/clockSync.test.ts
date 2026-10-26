/**
 * Lining up by scan (class/clockSync.ts), against simulated reads: the code is
 * redrawn every 100 ms, and each read arrives late by the code's age plus a
 * screen/camera delay. The estimate must land within a tenth of a second.
 */

import fc from 'fast-check';
import { estimateOffset, linedUp, SCAN_LATENCY_MS, type ClockRead } from '../clockSync';

function simulateReads(trueOffset: number, latencies: number[], startLocal = 5_000): ClockRead[] {
  return latencies.map((lat, i) => {
    const localAtDraw = startLocal + i * 150; // reads arrive ~every 150 ms
    const drawnAtLocal = Math.floor(localAtDraw / 100) * 100; // last 100 ms redraw
    return { classNow: drawnAtLocal + trueOffset, localNow: localAtDraw + lat };
  });
}

describe('clock line-up from scans', () => {
  it('lands within 0.1 s of the true offset for realistic delays', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.array(fc.integer({ min: 30, max: 140 }), { minLength: 8, maxLength: 30 }),
        (offset, lats) => {
          const est = estimateOffset(simulateReads(offset, lats))!;
          return Math.abs(est - offset) <= 100;
        },
      ),
    );
  });

  it('adds the unavoidable delay to the least-late read', () => {
    expect(estimateOffset([{ classNow: 1_000, localNow: 900 }, { classNow: 1_100, localNow: 1_050 }])).toBe(
      100 + SCAN_LATENCY_MS,
    );
    expect(estimateOffset([])).toBeNull();
  });

  it('waits for several redraws over a second before calling it lined up', () => {
    const same = Array.from({ length: 10 }, (_, i) => ({ classNow: 1, localNow: i * 200 }));
    expect(linedUp(same)).toBe(false); // one redraw read ten times
    expect(linedUp(simulateReads(0, [50, 50, 50, 50, 50, 50]))).toBe(false); // < 1 s
    expect(linedUp(simulateReads(0, Array(10).fill(50)))).toBe(true);
  });
});
