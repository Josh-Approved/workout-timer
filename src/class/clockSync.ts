/**
 * Lining a phone's clock up with the class, offline, by scanning.
 *
 * The instructor's class code is redrawn several times a second with the
 * class time at that moment (`classNow`). Each read the camera makes is a pair:
 * the class time printed in the code, and this phone's own clock when the read
 * arrived. Every source of error — how old the drawn code was, the screen's and
 * the camera's delay — only ever makes a read look LATE, never early. So the
 * best estimate is the read that looks least late (the maximum of
 * classNow − localNow), plus the delay no read can avoid (`SCAN_LATENCY_MS`,
 * tuned on real phones).
 */

export interface ClockRead {
  /** Class time the scanned code showed. */
  classNow: number;
  /** This phone's clock (live-timer `nowMs`) when the read arrived. */
  localNow: number;
}

/** Screen + camera + decode delay a read can't avoid. Tuned on real phones. */
export const SCAN_LATENCY_MS = 60;
/** Reads to collect before trusting the line-up. */
export const MIN_READS = 6;
/** And over at least this long, so the code has redrawn several times. */
export const MIN_SPAN_MS = 1000;

/** classTime = localNow + offset. Null without reads. */
export function estimateOffset(reads: ClockRead[]): number | null {
  if (reads.length === 0) return null;
  let best = -Infinity;
  for (const r of reads) best = Math.max(best, r.classNow - r.localNow);
  return Math.round(best + SCAN_LATENCY_MS);
}

/** Enough reads of different redraws, over long enough, to call this phone lined up. */
export function linedUp(reads: ClockRead[]): boolean {
  if (new Set(reads.map((r) => r.classNow)).size < MIN_READS) return false;
  const first = reads[0].localNow;
  const last = reads[reads.length - 1].localNow;
  return last - first >= MIN_SPAN_MS;
}
