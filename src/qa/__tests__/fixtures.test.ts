/**
 * The QA seed feeds every screenshot / capture run — a broken fixture silently
 * poisons those (a timer that can't render, a duplicate id the list dedupes, a
 * sequence that produces no "Exercise" phase the flow waits for). These cheap
 * assertions keep the seed honest.
 */

import { QA_TIMERS } from '../fixtures';
import { buildWorkoutSequence, getTotalDuration } from '../../utils/workout';

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
      expect(t.exercise).toBeGreaterThan(0); // a 0s exercise renders nothing to capture
      expect(t.sets).toBeGreaterThan(0);
      expect(t.cycles).toBeGreaterThan(0);
      // non-negative for the optional phases
      for (const v of [t.initialCountdown, t.warmUp, t.rest, t.recovery, t.coolDown]) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every timer produces a real, playable sequence with at least one Exercise', () => {
    for (const t of QA_TIMERS) {
      const steps = buildWorkoutSequence(t);
      expect(steps.length).toBeGreaterThan(0);
      // The screenshot flow waits for the "Exercise" phase label, so the seed
      // must actually reach it.
      expect(steps.some((s) => s.phase === 'exercise')).toBe(true);
      expect(getTotalDuration(t)).toBe(steps.reduce((sum, s) => sum + s.duration, 0));
      expect(getTotalDuration(t)).toBeGreaterThan(0);
    }
  });
});
