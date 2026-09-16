/**
 * The timer list must stay scrollable on a phone — defect workout-timer-20260912-1.
 *
 * On a phone-sized Android screen the main list sat pinned at the top: every
 * swipe left the screen pixel-identical (the tablet only passed because every
 * row fit). The cause was not layout. It was two `Gesture.Native()` handlers
 * attached to the ONE scroll view:
 *
 *   - react-native-reorderable-list wraps its FlatList in its own
 *     GestureDetector carrying `Gesture.Simultaneous(Gesture.Native(), pan)`;
 *   - SortableList then wrapped that whole list in a SECOND GestureDetector
 *     carrying the pull-to-reveal footer's `Gesture.Simultaneous(
 *     Gesture.Native(), Gesture.Pan())`. A GestureDetector attaches to the first
 *     native view under it, so this landed on the very same scroll view.
 *
 * Two native-view handlers on one Android ScrollView are not simultaneous with
 * each other. When the second one activates, gesture-handler's orchestrator
 * cancels the first, and a cancelled native handler sends ACTION_CANCEL straight
 * into the ScrollView — which drops the drag and ignores the rest of the swipe.
 * iOS drives the scroll from UIScrollView's own recognizer, so it hid there.
 *
 * The fix hands the over-pull tracking to the list's OWN pan (its `panGesture`
 * prop, as touch callbacks the library never overwrites), so there is exactly
 * one native handler on the scroll view. This test renders the real screen,
 * the real SortableList, the real reorderable list and the real footer hook,
 * records every gesture any GestureDetector attaches, and holds that count.
 * The scroll itself is only observable on a device; the structure that broke
 * it is observable here.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const METRICS = {
  frame: { x: 0, y: 0, width: 412, height: 915 },
  insets: { top: 24, left: 0, right: 0, bottom: 24 },
};

// The gesture each MOUNTED GestureDetector currently carries (latest render
// wins, unmount removes it), so a re-render is never double-counted.
const mockAttached = new Map<object, unknown>();

jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  const React_ = require('react');
  return {
    ...actual,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: React.ReactNode }) => {
      const key = React_.useRef({}).current;
      mockAttached.set(key, gesture);
      React_.useEffect(() => () => void mockAttached.delete(key), [key]);
      return React_.createElement(React_.Fragment, null, children);
    },
  };
});

// Reanimated's worklet runtime has no jest host; its official mock stands in.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  // Motion ON, so the pull-to-reveal gesture is wired exactly as it ships.
  useReducedMotion: () => false,
  // Absent from the mock; the reorderable list composes its scroll handler with ours.
  useComposedEventHandler: () => () => {},
  // The list calls its animated ref as a callback ref; the mock's is a plain object.
  useAnimatedRef: () => {
    const ref = require('react').useRef(null);
    if (!ref.current) {
      const cb: any = (v: unknown) => { cb.current = v; };
      cb.current = null;
      ref.current = cb;
    }
    return ref.current;
  },
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// The footer's visuals are irrelevant to how the list's gestures are wired.
jest.mock('../../components/FundingFooter', () => ({ FundingFooter: () => null }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));

// Enough rows to overflow a phone, as on the device that caught it.
const mockTimers = Array.from({ length: 8 }, (_, i) => ({
  id: `t${i}`,
  name: `Timer ${i}`,
  initialCountdown: 10,
  warmUp: 0,
  exercise: 20,
  rest: 10,
  sets: 8,
  recovery: 0,
  cycles: 1,
  coolDown: 60,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}));
jest.mock('../../storage/storage', () => ({
  loadTimers: () => Promise.resolve(mockTimers),
  saveTimers: () => Promise.resolve(),
}));

import { Platform } from 'react-native';
import TimerListScreen from '../TimerListScreen';

type AnyGesture = {
  toGestureArray: () => AnyGesture[];
  handlerName?: string;
  handlers?: Record<string, unknown>;
};

function flatten(): AnyGesture[] {
  return ([...mockAttached.values()] as AnyGesture[]).flatMap((g) => g.toGestureArray());
}

async function renderList() {
  const navigation = { navigate: jest.fn() };
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <TimerListScreen
        navigation={navigation as any}
        route={{ key: 'TimerList', name: 'TimerList' } as any}
      />
    </SafeAreaProvider>
  );
  await screen.findByText('Timer 7');
}

describe.each(['android', 'ios'] as const)('timer list gestures (%s)', (os) => {
  const original = Platform.OS;
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
  });
  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { get: () => original, configurable: true });
  });

  it('attaches exactly one native scroll handler to the list', async () => {
    await renderList();
    const natives = flatten().filter((g) => g.handlerName === 'NativeViewGestureHandler');
    // Two here is the defect: the second cancels the first and kills the scroll.
    expect(natives).toHaveLength(1);
  });

  it('still tracks the over-pull through the list\'s own pan', async () => {
    await renderList();
    const pans = flatten().filter((g) => g.handlerName === 'PanGestureHandler');
    // One pan: the reorder drag, which also carries the pull-to-reveal touches.
    expect(pans).toHaveLength(1);
    expect(typeof pans[0].handlers?.onTouchesMove).toBe('function');
    // Sharing that pan must not cost drag-to-reorder: the library still owns the
    // drag handlers on it (we only ever add touch callbacks, which it never
    // overwrites). onUpdate is the library's — ours sets no update handler.
    expect(typeof pans[0].handlers?.onUpdate).toBe('function');
  });
});
