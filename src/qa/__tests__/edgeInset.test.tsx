/**
 * No content flush against a card edge — defect: the Settings "Sounds" card
 * shipped with "Warm up start" touching the card's left border (and the
 * chevrons touching its right one). DrilldownRow brings no horizontal padding
 * of its own and the card supplied none, so every row sat at x = 0.
 *
 * The audit (src/qa/edgeInset.ts) reads the rendered tree, so every screen it
 * is pointed at is checked on every PR, before anyone has to spot it on a
 * phone. The first block proves it catches the shape that shipped; the second
 * runs it over the real screens. A new screen or sheet with cards belongs in
 * the second block.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

import { findEdgeInsetViolations, MIN_EDGE_INSET, type LayoutNode } from '../edgeInset';
import SettingsScreen from '../../screens/SettingsScreen';
import TimerEditorScreen from '../../screens/TimerEditorScreen';
import ActiveWorkoutScreen from '../../screens/ActiveWorkoutScreen';
import { DrilldownRow } from '../../components/DrilldownRow';
import { SoundStyleSheet } from '../../components/SoundStyleSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const card = { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' };

/** Render, wait for `readyText` if given (async loads, sheets), then audit. */
async function audit(ui: React.ReactElement, readyText?: string) {
  const r = await render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
  if (readyText) await screen.findByText(readyText);
  return findEdgeInsetViolations(r.toJSON() as LayoutNode | null);
}

describe('edge-inset audit — catches what shipped', () => {
  it('flags a DrilldownRow dropped straight into a card (the Sounds card defect)', async () => {
    const findings = await audit(
      <View style={card}>
        <DrilldownRow label="Warm up start" value="Voice" onPress={() => {}} />
      </View>
    );
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: 'Warm up start', edge: 'start', inset: 0 }),
      ])
    );
    // The chevron hugs the right border the same way.
    expect(findings.some((f) => f.edge === 'end')).toBe(true);
  });

  it('passes the same row once the card supplies a gutter', async () => {
    const findings = await audit(
      <View style={card}>
        <View style={{ paddingHorizontal: 16 }}>
          <DrilldownRow label="Warm up start" value="Voice" onPress={() => {}} />
        </View>
      </View>
    );
    expect(findings).toEqual([]);
  });

  it('flags a button label with no padding, and ignores centered content', async () => {
    const findings = await audit(
      <View>
        <Pressable style={{ backgroundColor: '#000', paddingHorizontal: MIN_EDGE_INSET - 4 }}>
          <Text>Too tight</Text>
        </Pressable>
        <View style={{ ...card, alignItems: 'center' }}>
          <Text>Centered</Text>
        </View>
        <View style={{ ...card, flexDirection: 'row', paddingHorizontal: 16 }}>
          <Text>Left</Text>
          <Text>Middle (never reaches an edge)</Text>
          <Text>Right</Text>
        </View>
      </View>
    );
    expect(findings.map((f) => f.content)).toEqual(['Too tight', 'Too tight']);
  });
});

describe('edge-inset audit — real screens', () => {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() } as any;

  it('Settings', async () => {
    const findings = await audit(
      <SettingsScreen navigation={navigation} route={{ key: 'Settings', name: 'Settings' } as any} />,
      'Warm up start'
    );
    expect(findings).toEqual([]);
  });

  it('Sound style sheet', async () => {
    const findings = await audit(
      <SoundStyleSheet
        visible
        eventLabel="Warm up start"
        value="voice"
        onClose={() => {}}
        onPick={() => {}}
      />,
      'Double Beep'
    );
    expect(findings).toEqual([]);
  });

  it('Timer editor', async () => {
    const findings = await audit(
      <TimerEditorScreen
        navigation={navigation}
        route={{ key: 'TimerEditor', name: 'TimerEditor', params: {} } as any}
      />
    );
    expect(findings).toEqual([]);
  });

  it.each([
    ['running', { mode: 'phase', stepIndex: 0, timeRemaining: 20 }, true],
    ['complete', { mode: 'complete', stepIndex: 0, timeRemaining: 0 }, false],
  ])('Active workout (%s)', async (_label, displayState, isRunning) => {
    mockPlayback.displayState = displayState;
    mockPlayback.isRunning = isRunning;
    const findings = await audit(
      <ActiveWorkoutScreen
        navigation={navigation}
        route={{ key: 'ActiveWorkout', name: 'ActiveWorkout', params: { timerId: 't' } } as any}
      />
    );
    expect(findings).toEqual([]);
  });
});
