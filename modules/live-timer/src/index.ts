// Public entry for live-timer.
//
// Routes both native action events (Android notification button taps,
// iOS LiveActivityIntent on iOS 17+) and deep-link action events
// (iOS 16 widget Link taps that open the host app via `fwt://action?...`)
// through a single JS subscriber registry. Consumers see one event
// stream regardless of source.

import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

type EventSubscription = { remove: () => void };

import LiveTimerModule from './LiveTimerModule';
import type {
  AudioOutput,
  LiveTimerActionId,
  LiveTimerAvailability,
  LiveTimerEvent,
  LiveTimerStartInput,
  LiveTimerUpdateInput,
} from './types';

export type {
  AudioOutput,
  LiveTimerActionId,
  LiveTimerAvailability,
  LiveTimerEvent,
  LiveTimerPhase,
  LiveTimerStartInput,
  LiveTimerUpdateInput,
} from './types';

const subscribers = new Set<(event: LiveTimerEvent) => void>();
let nativeWired = false;
let deepLinkWired = false;

function emit(event: LiveTimerEvent) {
  subscribers.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // listener errors are isolated
    }
  });
}

function wireNative() {
  if (nativeWired) return;
  nativeWired = true;
  const native = LiveTimerModule as unknown as {
    addListener?: (name: string, cb: (e: LiveTimerEvent) => void) => unknown;
  };
  if (typeof native.addListener === 'function') {
    native.addListener('event', emit);
  }
}

function parseDeepLink(url: string): LiveTimerEvent | null {
  try {
    const { hostname, queryParams } = Linking.parse(url);
    if (hostname !== 'action') return null;
    const sessionId = queryParams?.session;
    const action = queryParams?.action;
    if (typeof sessionId !== 'string' || typeof action !== 'string') return null;
    if (!['pause', 'resume', 'skip', 'stop'].includes(action)) return null;
    return { type: 'action', sessionId, action: action as LiveTimerActionId };
  } catch {
    return null;
  }
}

function wireDeepLinks() {
  if (deepLinkWired) return;
  deepLinkWired = true;

  Linking.addEventListener('url', ({ url }) => {
    const event = parseDeepLink(url);
    if (event) emit(event);
  });

  Linking.getInitialURL().then((url) => {
    if (!url) return;
    const event = parseDeepLink(url);
    if (event) emit(event);
  });
}

// The workout clock: keeps counting while the phone sleeps and never jumps
// when the OS adjusts the time of day (iOS CLOCK_MONOTONIC, Android
// elapsedRealtime). Milliseconds from an arbitrary origin, so only differences
// mean anything. Falls back to Date.now() where the native function is missing
// (jest, or a binary built before it existed).
export function nowMs(): number {
  return typeof LiveTimerModule.nowMs === 'function' ? LiveTimerModule.nowMs() : Date.now();
}

// A wake that still fires while the app is in the background. On Android JS
// timers stop when the app isn't in front, so the native side posts a "wake"
// event after `delayMs` (one pending wake per id; re-arming replaces it).
// Pair it with an ordinary setTimeout and let whichever comes first run. A
// no-op on iOS and in jest, where JS timers keep running.
export function wakeAfter(id: string, delayMs: number): void {
  if (typeof LiveTimerModule.wakeAfter === 'function') LiveTimerModule.wakeAfter(id, Math.max(0, delayMs));
}

export function cancelWake(id: string): void {
  if (typeof LiveTimerModule.cancelWake === 'function') LiveTimerModule.cancelWake(id);
}

// The phone's media volume and where its sound goes, for the diagnostic log.
// Null where the native function is missing (jest, or a binary built before it
// existed) or the phone won't say; never throws.
export async function getAudioOutput(): Promise<AudioOutput | null> {
  if (typeof LiveTimerModule.getAudioOutput !== 'function') return null;
  try {
    return await LiveTimerModule.getAudioOutput();
  } catch {
    return null;
  }
}

// Ask for what the on-screen timer needs (Android 13+ notifications) ahead of
// time — e.g. when a class is set up — so the prompt never lands on top of a
// running workout.
export function prepareLiveTimer(): Promise<void> {
  return ensureAndroidNotificationPermission();
}

export function getAvailability(): Promise<LiveTimerAvailability> {
  return LiveTimerModule.getAvailability();
}

// On Android 13+ (API 33), the persistent timer notification — and its
// pause/skip/stop controls — only appear if the user has granted
// POST_NOTIFICATIONS. The permission is off by default and must be requested
// at runtime. Without this, the foreground service still runs (audio cues keep
// playing in the background) but its notification is silently suppressed.
// Best-effort: if the user declines, we still start the timer.
async function ensureAndroidNotificationPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!permission) return;
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (alreadyGranted) return;
    await PermissionsAndroid.request(permission);
  } catch {
    // Permission flow failed; the live timer still runs without its notification.
  }
}

export async function startLiveTimer(input: LiveTimerStartInput): Promise<void> {
  await ensureAndroidNotificationPermission();
  return LiveTimerModule.start(input);
}

export function updateLiveTimer(input: LiveTimerUpdateInput): Promise<void> {
  return LiveTimerModule.update(input);
}

export function endLiveTimer(sessionId: string): Promise<void> {
  return LiveTimerModule.end(sessionId);
}

export function addLiveTimerListener(
  listener: (event: LiveTimerEvent) => void
): EventSubscription {
  wireNative();
  wireDeepLinks();
  subscribers.add(listener);
  return { remove: () => subscribers.delete(listener) };
}

// React hook: subscribe to action / dismiss events for the active session.
export function useLiveTimerEvents(
  onEvent: (event: LiveTimerEvent) => void
): void {
  const ref = useRef(onEvent);
  ref.current = onEvent;
  useEffect(() => {
    const sub = addLiveTimerListener((e) => ref.current(e));
    return () => sub.remove();
  }, []);
}

// React hook: tracks platform availability. Re-checks on mount.
export function useLiveTimerAvailability(): LiveTimerAvailability | null {
  const [state, setState] = useState<LiveTimerAvailability | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAvailability().then((a) => {
      if (!cancelled) setState(a);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
