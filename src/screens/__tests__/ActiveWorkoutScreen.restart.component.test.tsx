/**
 * The complete screen offers "Restart workout" under the Done readout, and the
 * button is reachable by a screen reader (it sits beside the grouped readout,
 * not inside it — a button inside an `accessible` container is invisible to
 * VoiceOver/TalkBack).
 */

import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// The screen reads set counts from the cue module, which loads the native
// audio player; the player is irrelevant to what's on screen.
jest.mock('../../audio/AudioEngine', () => ({ AudioEngine: {} }));
jest.mock('expo-screen-orientation', () => ({
  unlockAsync: () => Promise.resolve(),
  lockAsync: () => Promise.resolve(),
  OrientationLock: { PORTRAIT_UP: 1 },
}));

const mockRestart = jest.fn();
jest.mock('../useWorkoutPlayback', () => ({
  RESTART_THRESHOLD_SECONDS: 1,
  phaseLabel: (p: string) => p,
  useWorkoutPlayback: () => ({
    displayState: { mode: 'complete', stepIndex: 0, timeRemaining: 0 },
    isRunning: false,
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
    restart: mockRestart,
  }),
}));

import ActiveWorkoutScreen from '../ActiveWorkoutScreen';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('Active workout — complete', () => {
  it('restarts the workout from the Restart workout button', async () => {
    const navigation = { goBack: jest.fn() } as any;
    const user = userEvent.setup();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ActiveWorkoutScreen
          navigation={navigation}
          route={{ key: 'ActiveWorkout', name: 'ActiveWorkout', params: { timerId: 't' } } as any}
        />
      </SafeAreaProvider>
    );

    expect(screen.getByLabelText('Workout complete')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Restart workout' }));
    expect(mockRestart).toHaveBeenCalledTimes(1);
    expect(navigation.goBack).not.toHaveBeenCalled();

    // Leaving is still its own control.
    await user.press(screen.getByRole('button', { name: 'Back to timers' }));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
