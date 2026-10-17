/**
 * The saved-timers upgrade (v1 bare array → v2 envelope with `kind`). A
 * user's timers are the only data this app holds; a migration that reshapes
 * or drops one is the worst bug it can ship. These pin the v1 → v2 path on
 * the exact pre-2026-10 payload, the v2 round-trip, and the clone used by
 * Duplicate.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { migrateTimersPayload, normalizeTimer, packTimers, TIMERS_VERSION } from '../timersMigration';
import { cloneTimer } from '../storage';
import { buildWorkoutSequence } from '../../utils/workout';
import type { TimerConfig } from '../../types';

// A v1 record exactly as 1.1.11 wrote it: no kind, no v2 fields.
const V1_TABATA = {
  id: 'default_tabata',
  name: 'Standard Tabata',
  initialCountdown: 15,
  warmUp: 120,
  exercise: 20,
  rest: 10,
  sets: 8,
  recovery: 0,
  cycles: 4,
  coolDown: 120,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe('migrateTimersPayload — v1 (bare array) → v2', () => {
  it('stamps kind: intervals on each timer and changes nothing else', () => {
    const { timers, from, changed } = migrateTimersPayload([V1_TABATA]);
    expect(from).toBe(1);
    expect(changed).toBe(true);
    expect(timers).toEqual([{ ...V1_TABATA, kind: 'intervals' }]);
  });

  it('plays a migrated v1 timer exactly as the v1 engine did', () => {
    const legacy = V1_TABATA as unknown as TimerConfig;
    const [migrated] = migrateTimersPayload([V1_TABATA]).timers;
    expect(buildWorkoutSequence(migrated)).toEqual(buildWorkoutSequence(legacy));
  });

  it('keeps the user\'s order and drops only records with no id', () => {
    const { timers } = migrateTimersPayload([
      { ...V1_TABATA, id: 'b', name: 'B' },
      { name: 'no id' },
      { ...V1_TABATA, id: 'a', name: 'A' },
    ]);
    expect(timers.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('an empty v1 array migrates to an empty v2 list (not the defaults)', () => {
    const r = migrateTimersPayload([]);
    expect(r).toEqual({ timers: [], from: 1, changed: true });
  });
});

describe('migrateTimersPayload — v2 round-trip', () => {
  it('reads back what packTimers wrote, unchanged', () => {
    const seq: TimerConfig = {
      ...V1_TABATA,
      id: 'seq',
      kind: 'sequence',
      intervals: [{ id: 'i1', name: 'Swings', duration: 30, kind: 'work' }],
      repeats: 2,
    };
    const amrap: TimerConfig = { ...V1_TABATA, id: 'am', kind: 'amrap', timeCap: 600 };
    const payload = JSON.parse(JSON.stringify(packTimers([seq, amrap])));
    const r = migrateTimersPayload(payload);
    expect(r.from).toBe(TIMERS_VERSION);
    expect(r.changed).toBe(false);
    expect(r.timers).toEqual([seq, amrap]);
  });

  it('normalizes a malformed v2 record instead of crashing the list', () => {
    const r = migrateTimersPayload({
      _version: 2,
      timers: [
        { id: 'x', name: 'X', kind: 'sequence', intervals: [{ name: 'A', duration: '30' }, null], repeats: 0 },
        { id: 'y', name: 'Y', kind: 'bogus', exercise: 20 },
      ],
    });
    expect(r.timers[0].intervals).toEqual([{ id: 'iv-0', name: 'A', duration: 0, kind: 'work' }]);
    expect(r.timers[0].repeats).toBe(1);
    expect(r.timers[1].kind).toBe('intervals');
    expect(r.timers[1].sets).toBe(1);
  });

  it('reports nothing usable for garbage, so the loader can fall back', () => {
    expect(migrateTimersPayload(null)).toEqual({ timers: [], from: null, changed: false });
    expect(migrateTimersPayload('nope')).toEqual({ timers: [], from: null, changed: false });
    expect(migrateTimersPayload({ _version: 2 })).toEqual({ timers: [], from: null, changed: false });
  });
});

describe('normalizeTimer', () => {
  it('fills the For Time cap and clamps a negative one to 0', () => {
    expect(normalizeTimer({ id: 'f', name: 'F', kind: 'for_time' })?.timeCap).toBe(0);
    expect(normalizeTimer({ id: 'f', name: 'F', kind: 'amrap', timeCap: -5 })?.timeCap).toBe(0);
  });
});

describe('cloneTimer — the Duplicate action', () => {
  it('copies every field under a new id and name, with fresh interval ids', () => {
    let n = 0;
    const source: TimerConfig = {
      ...V1_TABATA,
      id: 'src',
      kind: 'sequence',
      intervals: [
        { id: 'i1', name: 'A', duration: 10, kind: 'work' },
        { id: 'i2', name: 'B', duration: 5, kind: 'rest' },
      ],
      repeats: 3,
    };
    const copy = cloneTimer(source, 'new', 'Standard Tabata copy', () => `iv${++n}`);
    expect(copy.id).toBe('new');
    expect(copy.name).toBe('Standard Tabata copy');
    expect(copy.repeats).toBe(3);
    expect(copy.intervals).toEqual([
      { id: 'iv1', name: 'A', duration: 10, kind: 'work' },
      { id: 'iv2', name: 'B', duration: 5, kind: 'rest' },
    ]);
    // The source is untouched.
    expect(source.intervals![0].id).toBe('i1');
    expect(buildWorkoutSequence(copy)).toEqual(buildWorkoutSequence(source));
  });

  it('leaves intervals undefined on a timer that has none', () => {
    const copy = cloneTimer({ ...V1_TABATA, kind: 'intervals' }, 'new', 'copy', () => 'x');
    expect(copy.intervals).toBeUndefined();
  });
});
