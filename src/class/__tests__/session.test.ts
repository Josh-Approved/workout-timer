/**
 * Saved classes (class/session.ts): rejoining after the app closes is only
 * offered when the line-up is still good — the phone hasn't rebooted (its
 * workout clock restarts at boot) and the class isn't over.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import type { TimerConfig } from '../../types';
import { parseClassCode, classCodeUrl } from '../classCode';
import { hostSession, memberSession, canRejoin } from '../session';

const workout: TimerConfig = {
  id: 'w',
  name: 'Ten minutes',
  initialCountdown: 0,
  warmUp: 0,
  exercise: 60,
  rest: 0,
  sets: 10,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
  createdAt: 0,
  updatedAt: 0,
};

describe('class sessions', () => {
  const host = hostSession(workout, 30_000, 500_000, 1_700_000_000_000);

  it('a hosted class carries a code any phone can join from', () => {
    const got = parseClassCode(classCodeUrl(host.invite, 500_000, 1_700_000_000_000))!;
    expect(got.invite.startAt).toBe(530_000);
    expect(got.invite.key).toBe(host.key);
    expect(got.invite.host).toBe(host.hostPub);
    const member = memberSession(got.invite, host.invite, 1_234, 9_000, 1_700_000_000_000);
    expect(member.role).toBe('member');
    expect(member.timeline.startAt).toBe(530_000);
    expect(member.hostSecret).toBeUndefined();
  });

  it('can be rejoined mid-class after the app was closed', () => {
    expect(canRejoin(host, 500_000 + 120_000, 1_700_000_000_000 + 120_000)).toBe(true);
  });

  it('not after a reboot, and not once the class is over', () => {
    expect(canRejoin(host, 3_000, 1_700_000_000_000 + 120_000)).toBe(false); // clock restarted
    expect(canRejoin(host, 500_000 + 60_000, 1_700_000_000_000 + 600_000)).toBe(false); // clocks disagree
    expect(canRejoin(host, 500_000 + 700_000, 1_700_000_000_000 + 700_000)).toBe(false); // 10 min workout done
  });
});
