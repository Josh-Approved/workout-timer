/**
 * The QA seed feeds every screenshot / capture run — a broken fixture silently
 * poisons those (a timer that can't render, a duplicate id the list dedupes, a
 * sequence that produces no "Exercise" phase the flow waits for). These cheap
 * assertions keep the seed honest.
 */

import { QA_TIMERS } from '../fixtures';
import { buildWorkoutSequence, getTotalDuration } from '../../utils/workout';
import { timerKind } from '../../types';

describe('QA_TIMERS seed is internally consistent', () => {
  it('seeds at least one timer', () => {
    expect(QA_TIMERS.length).toBeGreaterThan(0);
  });

  it('has unique ids (the list dedupes by id — collisions would hide a timer)', () => {
    const ids = QA_TIMERS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the anchored "Standard Tabata" timer the screenshot flow targets', () => {
    // qa/selectors.json anchors @edit-tabata / @start-tabata to this exact name.
    const tabata = QA_TIMERS.find((t) => t.name === 'Standard Tabata');
    expect(tabata).toBeDefined();
    expect(tabata!.id).toBe('qa-tabata');
  });

  it('every timer has sane positive core fields', () => {
    for (const t of QA_TIMERS) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      if (timerKind(t) === 'intervals') {
        expect(t.exercise).toBeGreaterThan(0); // a 0s exercise renders nothing to capture
        expect(t.sets).toBeGreaterThan(0);
        expect(t.cycles).toBeGreaterThan(0);
      }
      // non-negative for the optional phases
      for (const v of [t.initialCountdown, t.warmUp, t.rest, t.recovery, t.coolDown]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('seeds one custom sequence with named intervals (the sequence captures depend on it)', () => {
    const seq = QA_TIMERS.filter((t) => timerKind(t) === 'sequence');
    expect(seq.length).toBeGreaterThanOrEqual(1);
    for (const t of seq) {
      expect(t.intervals!.length).toBeGreaterThan(0);
      for (const iv of t.intervals!) {
        expect(iv.name.trim().length).toBeGreaterThan(0);
        expect(iv.duration).toBeGreaterThan(0);
      }
      expect(new Set(t.intervals!.map((iv) => iv.id)).size).toBe(t.intervals!.length);
    }
  });

  it('every timer produces a real, playable sequence that reaches a work phase', () => {
    for (const t of QA_TIMERS) {
      const steps = buildWorkoutSequence(t);
      expect(steps.length).toBeGreaterThan(0);
      // The screenshot flow waits for the "Exercise" phase label on the
      // anchored Tabata; every seed must at least reach its own work phase.
      expect(steps.some((s) => s.phase === 'exercise' || s.phase === 'amrap' || s.phase === 'for_time')).toBe(true);
      expect(getTotalDuration(t)).toBe(steps.reduce((sum, s) => sum + s.duration, 0));
      expect(getTotalDuration(t)).toBeGreaterThan(0);
    }
  });
});
