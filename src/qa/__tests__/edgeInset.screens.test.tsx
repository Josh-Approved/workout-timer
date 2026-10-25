/**
 * Edge-inset audit over this app's own screens — APP-OWNED: seeded once by
 * `sync.mjs qa`, never overwritten.
 *
 * src/qa/edgeInset.ts (canonical) fails when text, an input or an icon sits
 * closer than 8pt to the inside edge of a card, sheet, row or button; the
 * canonical edgeInset.proof.test.tsx proves it catches the shape that shipped
 * here (the Settings "Sounds" card, "Warm up start" against its left border).
 *
 * What belongs here: Settings, and every screen, sheet or pane that draws a
 * card, a filled or bordered row, or a labelled button. The timer list renders
 * one seeded timer; the active screen renders from a fixed playback snapshot
 * (running and complete). A new screen or sheet gets a line here in the same
 * PR. qa-canonical `test/edge-inset-screens` warns while this file renders none
 * of the app's screens or components.
 *
 * Fixing a finding: give the content room inside the surface, usually the
 * card's own `paddingHorizontal` (space.s5 or space.s6, matching the rows
 * around it), rather than padding each row.
 */

import React from 'react';

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('../../audio/AudioEngine', () => ({
  AudioEngine: {
    setVolume: jest.fn(),
    getVolume: () => 1,
    playSound: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('expo-screen-orientation', () => ({
  unlockAsync: () => Promise.resolve(),
  lockAsync: () => Promise.resolve(),
  OrientationLock: { PORTRAIT_UP: 1 },
}));
// One seeded timer on the list (the QA fixture's first row); settings and the
// rest of storage stay real on the AsyncStorage mock.
jest.mock('../../storage/storage', () => ({
  ...jest.requireActual('../../storage/storage'),
  loadTimers: () =>
    Promise.resolve([
      {
        id: 'qa-tabata',
        name: 'Standard Tabata',
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
      },
    ]),
}));
// The pull-to-reveal footer and drag-to-reorder list are reanimated and
// gesture-handler machinery with no bearing on padding. SortableList is stood
// in by a plain renderer that hands `renderItem` what the real one does, so
// each timer card renders unchanged.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    interpolate: (v: number, inRange: number[], outRange: number[]) =>
      outRange[0] + (v - inRange[0]) * (outRange[1] - outRange[0]),
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    GestureHandlerRootView: View,
  };
});
jest.mock('../../components/usePullRevealFooter', () => ({
  usePullRevealFooter: () => ({
    pullToReveal: false,
    reveal: undefined,
    gesture: undefined,
    onScroll: undefined,
    onScrollViewLayout: undefined,
    onContentSizeChange: undefined,
    footerHeight: 0,
    onFooterLayout: undefined,
  }),
}));
jest.mock('../../components/SortableList', () => {
  const React_ = require('react');
  const { View } = require('react-native');
  return {
    SortableList: ({ items, keyExtractor, renderItem }: any) =>
      React_.createElement(
        View,
        null,
        items.map((item: any, index: number) =>
          React_.createElement(
            View,
            { key: keyExtractor(item) },
            renderItem({
              item,
              index,
              drag: () => {},
              accessibilityProps: { accessibilityActions: [], onAccessibilityAction: () => {} },
            })
          )
        )
      ),
  };
});
// Real price buttons, so the audit sees the tip tiers as they render.
jest.mock('../../lib/tipJar', () => {
  const { TIP_PRODUCT_IDS } = require('../../constants/tipProducts');
  return {
    isStoreKnownUnavailable: () => false,
    useTipJar: () => ({
      status: 'ready',
      products: TIP_PRODUCT_IDS.map((id: string) => ({ id, displayPrice: '$2.99' })),
      pendingSku: null,
      tip: jest.fn(),
    }),
  };
});

// The active screen's playback hook is swapped for a fixed snapshot so the
// complete state renders without running a whole workout.
const mockPlayback = {
  displayState: { mode: 'phase', stepIndex: 0, timeRemaining: 20 } as any,
  isRunning: true,
};
jest.mock('../../screens/useWorkoutPlayback', () => ({
  RESTART_THRESHOLD_SECONDS: 1,
  phaseLabel: (p: string) => p,
  useWorkoutPlayback: () => ({
    displayState: mockPlayback.displayState,
    isRunning: mockPlayback.isRunning,
    loaded: true,
    steps: [{ phase: 'exercise', duration: 20, setNumber: 1, cycleNumber: 1 }],
    totalDuration: 20,
    maxCycles: 1,
    togglePause: jest.fn(),
    handleBack: jest.fn(),
    handleSkip: jest.fn(),
    handleStop: jest.fn(),
    handleFinish: jest.fn(),
    kind: 'intervals',
    openEnded: false,
    rounds: 0,
    countRound: jest.fn(),
    undoRound: jest.fn(),
    finalElapsed: null,
    restart: jest.fn(),
  }),
}));

import { auditScreen } from '../edgeInsetAudit';
import SettingsScreen from '../../screens/SettingsScreen';
import TimerListScreen from '../../screens/TimerListScreen';
import TimerEditorScreen from '../../screens/TimerEditorScreen';
import ActiveWorkoutScreen from '../../screens/ActiveWorkoutScreen';
import { SoundStyleSheet } from '../../components/SoundStyleSheet';
import ValueEditorModal from '../../components/ValueEditorModal';
import TipJarSheet from '../../components/TipJarSheet';
import { TIP_PRODUCT_IDS } from '../../constants/tipProducts';

/* eslint-disable @typescript-eslint/no-explicit-any */
const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => () => {}),
} as any;
const route = (name: string, params?: object) => ({ key: name, name, params }) as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
const noop = () => {};

describe("edge-inset audit — this app's screens", () => {
  it('Settings', async () => {
    expect(
      await auditScreen(<SettingsScreen navigation={navigation} route={route('Settings')} />, {
        readyText: 'Warm up start',
      })
    ).toEqual([]);
  });

  it('Timer list', async () => {
    expect(
      await auditScreen(<TimerListScreen navigation={navigation} route={route('TimerList')} />, {
        readyText: 'Standard Tabata',
      })
    ).toEqual([]);
  });

  it('Timer editor', async () => {
    expect(
      await auditScreen(<TimerEditorScreen navigation={navigation} route={route('TimerEditor', {})} />)
    ).toEqual([]);
  });

  it.each([
    ['running', { mode: 'phase', stepIndex: 0, timeRemaining: 20 }, true],
    ['complete', { mode: 'complete', stepIndex: 0, timeRemaining: 0 }, false],
  ])('Active workout (%s)', async (_label, displayState, isRunning) => {
    mockPlayback.displayState = displayState;
    mockPlayback.isRunning = isRunning;
    expect(
      await auditScreen(
        <ActiveWorkoutScreen navigation={navigation} route={route('ActiveWorkout', { timerId: 't' })} />
      )
    ).toEqual([]);
  });

  it('Sound style sheet', async () => {
    expect(
      await auditScreen(
        <SoundStyleSheet visible eventLabel="Warm up start" value="voice" onClose={noop} onPick={noop} />,
        { readyText: 'Double Beep' }
      )
    ).toEqual([]);
  });

  it('Value editor', async () => {
    expect(
      await auditScreen(
        <ValueEditorModal
          visible
          label="Exercise"
          value={20}
          isTime
          min={1}
          max={3600}
          onSave={noop}
          onCancel={noop}
        />
      )
    ).toEqual([]);
  });

  it('Tip jar sheet', async () => {
    expect(
      await auditScreen(<TipJarSheet visible onDismiss={noop} productIds={TIP_PRODUCT_IDS} />)
    ).toEqual([]);
  });
});
