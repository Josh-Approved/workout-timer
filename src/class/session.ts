/**
 * A class this phone is in — as the instructor (host) or a member — and the
 * little it needs to keep: the workout, the class's keys, its timeline, and
 * this phone's clock offset to class time. Kept on the phone (AsyncStorage) so
 * a phone that closes the app mid-class can rejoin; nothing here leaves it
 * except what the class code and the relay carry.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TimerConfig } from '../types';
import { buildWorkoutSequence } from '../utils/workout';
import { encodeInvite, type ClassInvite } from './classCode';
import { newClassKeys } from './relay';
import { classIsOver, newTimeline, type ClassTimeline } from './timeline';

export interface ClassSession {
  role: 'host' | 'member';
  workout: TimerConfig;
  /** The class code's fixed part, for redrawing it (any phone in the class can). */
  invite: string;
  key: string;
  hostPub: string;
  /** Instructor only. */
  hostSecret?: string;
  /** Class time = this phone's `nowMs()` + offsetMs (0 on the instructor's phone). */
  offsetMs: number;
  timeline: ClassTimeline;
  /** This phone's two clocks at join, to tell a relaunch from a reboot. */
  joined: { mono: number; wall: number };
}

/** Start a class from one of the instructor's timers, `startInMs` from now. */
export function hostSession(workout: TimerConfig, startInMs: number, monoNow: number, wallNow: number): ClassSession {
  const keys = newClassKeys();
  const timeline = newTimeline(monoNow + startInMs);
  const shared = { ...workout, id: `class-${timeline.startAt}`, createdAt: 0, updatedAt: 0 };
  return {
    role: 'host',
    workout: shared,
    invite: encodeInvite({ workout: shared, startAt: timeline.startAt, key: keys.key, host: keys.hostPub }),
    key: keys.key,
    hostPub: keys.hostPub,
    hostSecret: keys.hostSecret,
    offsetMs: 0,
    timeline,
    joined: { mono: monoNow, wall: wallNow },
  };
}

/** Join a class from a scanned code, with this phone's lined-up offset. */
export function memberSession(
  invite: ClassInvite,
  inviteCode: string,
  offsetMs: number,
  monoNow: number,
  wallNow: number,
): ClassSession {
  return {
    role: 'member',
    workout: invite.workout,
    invite: inviteCode,
    key: invite.key,
    hostPub: invite.host,
    offsetMs,
    timeline: newTimeline(invite.startAt),
    joined: { mono: monoNow, wall: wallNow },
  };
}

/** Classes are gone after this long, whatever the timeline says. */
const MAX_CLASS_MS = 6 * 3600 * 1000;
/** Both clocks must have moved together this closely since joining. */
const REBOOT_TOLERANCE_MS = 2000;

/**
 * Whether a saved class can be rejoined now: this phone hasn't rebooted since
 * joining (its workout clock restarts at boot, so the offset would be wrong),
 * the class isn't over, and it isn't stale.
 */
export function canRejoin(s: ClassSession, monoNow: number, wallNow: number): boolean {
  const monoMoved = monoNow - s.joined.mono;
  const wallMoved = wallNow - s.joined.wall;
  if (monoMoved < 0 || Math.abs(monoMoved - wallMoved) > REBOOT_TOLERANCE_MS) return false;
  if (monoMoved > MAX_CLASS_MS) return false;
  return !classIsOver(buildWorkoutSequence(s.workout), s.timeline, monoNow + s.offsetMs);
}

const KEY = '@fwt/class';

export async function saveClassSession(s: ClassSession): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Rejoin-after-close is a convenience; the class itself runs without it.
  }
}

export async function loadClassSession(): Promise<ClassSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClassSession) : null;
  } catch {
    return null;
  }
}

export async function clearClassSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
