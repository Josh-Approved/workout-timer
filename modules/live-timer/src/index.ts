// Public entry for live-timer.
//
// Routes both native action events (Android notification button taps,
// iOS LiveActivityIntent on iOS 17+) and deep-link action events
// (iOS 16 widget Link taps that open the host app via `fwt://action?...`)
// through a single JS subscriber registry. Consumers see one event
// stream regardless of source.

import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';

type EventSubscription = { remove: () => void };

import LiveTimerModule from './LiveTimerModule';
import type {
  LiveTimerActionId,
  LiveTimerAvailability,
  LiveTimerEvent,
  LiveTimerStartInput,
  LiveTimerUpdateInput,
} from './types';

export type {
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

export function getAvailability(): Promise<LiveTimerAvailability> {
  return LiveTimerModule.getAvailability();
}

export function startLiveTimer(input: LiveTimerStartInput): Promise<void> {
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
