/**
 * Versioned shape of the saved-timers payload (AsyncStorage key `@fwt/timers`).
 *
 * v1 (through 1.1.11): a bare JSON array of TimerConfig, every timer the
 *    classic intervals shape.
 * v2 (2026-10-17): `{ _version: 2, timers: [...] }`. Every timer carries an
 *    explicit `kind`; `intervals` / `repeats` / `timeCap` exist for the new
 *    kinds. A v1 record is upgraded by stamping `kind: 'intervals'` on each
 *    timer — nothing else about it changes, so a user's saved timers play
 *    exactly as before.
 *
 * Pure (no storage calls) so the upgrade is unit-testable on its own.
 */

import type { TimerConfig, TimerKind, SequenceInterval } from '../types';
import { ALL_TIMER_KINDS } from '../types';

export const TIMERS_VERSION = 2;

export interface TimersPayload {
  _version: number;
  timers: TimerConfig[];
}

export interface MigrationResult {
  timers: TimerConfig[];
  /** The version the stored payload was at, or null when nothing usable was stored. */
  from: number | null;
  /** True when the payload needs writing back in the current shape. */
  changed: boolean;
}

function isKind(v: unknown): v is TimerKind {
  return typeof v === 'string' && (ALL_TIMER_KINDS as string[]).includes(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeIntervals(raw: unknown): SequenceInterval[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SequenceInterval[] = [];
  raw.forEach((iv, i) => {
    if (!iv || typeof iv !== 'object') return;
    const r = iv as Record<string, unknown>;
    out.push({
      id: typeof r.id === 'string' && r.id ? r.id : `iv-${i}`,
      name: typeof r.name === 'string' ? r.name : '',
      duration: Math.max(0, Math.floor(num(r.duration, 0))),
      kind: r.kind === 'rest' ? 'rest' : 'work',
    });
  });
  return out;
}

/**
 * Bring one stored timer up to the v2 shape. Legacy fields are preserved
 * verbatim (a v1 timer only gains `kind: 'intervals'`); the v2-only fields
 * are normalized so the engine never sees a malformed list.
 */
export function normalizeTimer(raw: unknown): TimerConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const kind: TimerKind = isKind(r.kind) ? r.kind : 'intervals';
  const timer: TimerConfig = {
    ...(r as unknown as TimerConfig),
    id: r.id,
    name: typeof r.name === 'string' ? r.name : '',
    kind,
    initialCountdown: num(r.initialCountdown, 0),
    warmUp: num(r.warmUp, 0),
    exercise: num(r.exercise, 0),
    rest: num(r.rest, 0),
    sets: num(r.sets, 1),
    recovery: num(r.recovery, 0),
    cycles: num(r.cycles, 1),
    coolDown: num(r.coolDown, 0),
    createdAt: num(r.createdAt, 0),
    updatedAt: num(r.updatedAt, 0),
  };
  if (kind === 'sequence') {
    timer.intervals = sanitizeIntervals(r.intervals) ?? [];
    timer.repeats = Math.max(1, Math.floor(num(r.repeats, 1)));
  }
  if (kind === 'amrap' || kind === 'for_time') {
    timer.timeCap = Math.max(0, Math.floor(num(r.timeCap, 0)));
  }
  return timer;
}

/** Upgrade whatever was stored (parsed JSON) to the current payload shape. */
export function migrateTimersPayload(stored: unknown): MigrationResult {
  // v1: a bare array.
  if (Array.isArray(stored)) {
    const timers = stored.map(normalizeTimer).filter((t): t is TimerConfig => t != null);
    return { timers, from: 1, changed: true };
  }
  if (stored && typeof stored === 'object') {
    const p = stored as Partial<TimersPayload>;
    if (Array.isArray(p.timers)) {
      const from = typeof p._version === 'number' ? p._version : 0;
      const timers = p.timers.map(normalizeTimer).filter((t): t is TimerConfig => t != null);
      return { timers, from, changed: from !== TIMERS_VERSION };
    }
  }
  return { timers: [], from: null, changed: false };
}

/** The current on-disk shape for a list of timers. */
export function packTimers(timers: TimerConfig[]): TimersPayload {
  return { _version: TIMERS_VERSION, timers };
}
