/**
 * The class code (class/classCode.ts): the whole invitation must survive the
 * trip through a QR code exactly, and anything that isn't a class code this
 * version understands must be refused, never half-read.
 */

import type { TimerConfig } from '../../types';
import { buildWorkoutSequence } from '../../utils/workout';
import { encodeInvite, classCodeUrl, parseClassCode, wallOffsetOf, type ClassInvite } from '../classCode';

const base: TimerConfig = {
  id: 'x',
  name: 'Tabata Ü 💪',
  initialCountdown: 5,
  warmUp: 60,
  exercise: 20,
  rest: 10,
  sets: 8,
  recovery: 60,
  cycles: 2,
  coolDown: 120,
  createdAt: 1,
  updatedAt: 2,
};

const inv = (workout: TimerConfig): ClassInvite => ({
  workout,
  startAt: 123_456_789,
  key: 'a'.repeat(43) + '=',
  host: 'b'.repeat(43) + '=',
});

describe('class code', () => {
  it('round-trips an intervals timer to the same workout', () => {
    const url = classCodeUrl(encodeInvite(inv(base)), 123_400_000, 1_700_000_000_000);
    const got = parseClassCode(url)!;
    expect(got.classNow).toBe(123_400_000);
    expect(got.invite.startAt).toBe(123_456_789);
    expect(got.invite.workout.name).toBe('Tabata Ü 💪');
    expect(buildWorkoutSequence(got.invite.workout)).toEqual(buildWorkoutSequence(base));
  });

  it('round-trips a named custom sequence, AMRAP and For Time', () => {
    const seq: TimerConfig = {
      ...base,
      kind: 'sequence',
      repeats: 3,
      intervals: [
        { id: '1', name: 'Burpees', duration: 40, kind: 'work' },
        { id: '2', name: 'Breathe', duration: 20, kind: 'rest' },
      ],
    };
    for (const w of [seq, { ...base, kind: 'amrap' as const, timeCap: 600 }, { ...base, kind: 'for_time' as const, timeCap: 0 }]) {
      const got = parseClassCode(classCodeUrl(encodeInvite(inv(w)), 1, 2))!;
      expect(buildWorkoutSequence(got.invite.workout)).toEqual(buildWorkoutSequence(w));
    }
  });

  it('stays small enough to scan from across a room', () => {
    expect(classCodeUrl(encodeInvite(inv(base)), 9_999_999_999, 1_799_999_999_999).length).toBeLessThan(400);
  });

  it('refuses anything else', () => {
    expect(parseClassCode('https://example.com')).toBeNull();
    expect(parseClassCode('fwt://action?session=1&action=pause')).toBeNull();
    expect(parseClassCode('fwt://class?v=2&d=abc&c=1')).toBeNull();
    expect(parseClassCode('fwt://class?v=1&d=%%%&c=1')).toBeNull();
    expect(parseClassCode('fwt://class?v=1&d=e30&c=1')).toBeNull(); // {}
  });

  it('reads a link with no draw time as a code that can not line a clock up', () => {
    const d = encodeInvite(inv(base));
    expect(parseClassCode(`fwt://class?v=1&d=${d}`)!.classNow).toBeNull();
  });

  it('carries the instructor time-of-day offset for link joins', () => {
    const got = parseClassCode(classCodeUrl(encodeInvite(inv(base)), 5_000, 1_700_000_000_000))!;
    expect(wallOffsetOf(got.classNow, got.wallNow)).toBe(5_000 - 1_700_000_000_000);
    expect(wallOffsetOf(null, 1)).toBeNull();
  });
});
