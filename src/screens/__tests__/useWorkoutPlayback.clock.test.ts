/**
 * The workout driver on its real clock (useWorkoutPlayback + utils/workoutClock)
 * — the device-free version of "the timer can't drift". Fake timers move both
 * the wake timeouts and the clock (live-timer's `nowMs` reads Date.now here);
 * `mockStall` moves the clock alone — real time passing while no wake fires,
 * which is exactly a stalled phone.
 */

import { renderHook, act } from '@testing-library/react-native';

// 10s work / 5s rest × 3 sets: work 0–10, rest 10–15, work 15–25, rest 25–30, work 30–40.
const mockTimer = {
  id: 't',
  name: 'Drift check',
  createdAt: 0,
  updatedAt: 0,
  initialCountdown: 0,
  warmUp: 0,
  exercise: 10,
  rest: 5,
  sets: 3,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
};

jest.mock('../../storage/storage', () => ({
  loadTimers: jest.fn(async () => [mockTimer]),
  loadSettings: jest.fn(async () => ({
    audioAccessibilityMode: false,
    sounds: {
      warmUpStart: 'beep',
      workStart: 'beep',
      restStart: 'beep',
      recoveryStart: 'beep',
      coolDownStart: 'beep',
      workoutComplete: 'beep',
      halfwaySound: 'none',
      countdownDuration: 3,
      volume: 100,
    },
  })),
}));
jest.mock('../../audio/AudioEngine', () => ({
  AudioEngine: {
    setVolume: jest.fn(),
    prepare: jest.fn(),
    startKeepAlive: jest.fn(async () => {}),
    stopKeepAlive: jest.fn(),
    playTick: jest.fn(async () => {}),
    playSound: jest.fn(async () => {}),
  },
}));
jest.mock('../../audio/workoutCues', () => ({
  firePhaseStart: jest.fn(),
  playComplete: jest.fn(),
  getMaxCycles: () => 1,
  speakAndReactivate: jest.fn(),
  fireRoundCounted: jest.fn(),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: async () => {},
  deactivateKeepAwake: () => {},
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const mockStall = { ms: 0 };
jest.mock('live-timer', () => ({
  startLiveTimer: jest.fn(async () => {}),
  updateLiveTimer: jest.fn(async () => {}),
  endLiveTimer: jest.fn(async () => {}),
  useLiveTimerEvents: () => {},
  nowMs: () => Date.now() + mockStall.ms,
}));

import { useWorkoutPlayback } from '../useWorkoutPlayback';
import { firePhaseStart, playComplete } from '../../audio/workoutCues';
import { AudioEngine } from '../../audio/AudioEngine';
import { startLiveTimer } from 'live-timer';

async function startWorkout() {
  const hook = await renderHook(() => useWorkoutPlayback('t', jest.fn()));
  for (let i = 0; i < 5; i++) await act(async () => {}); // let the load settle
  expect(hook.result.current.loaded).toBe(true);
  return hook;
}

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers({ now: 1_000_000 });
  jest.clearAllMocks();
  mockStall.ms = 0;
});
afterEach(() => jest.useRealTimers());

describe('useWorkoutPlayback — the timer runs on its clock', () => {
  it('is exactly where real time says after 25 s', async () => {
    const { result } = await startWorkout();
    await advance(25_000);
    expect(result.current.displayState).toEqual({ mode: 'phase', stepIndex: 3, timeRemaining: 5 });
  });

  it('twenty pause/resume cycles part-way through a second add and lose nothing', async () => {
    const { result } = await startWorkout();
    for (let i = 0; i < 20; i++) {
      await advance(700);
      await act(() => result.current.togglePause());
      await advance(3_000);
      await act(() => result.current.togglePause());
    }
    // 20 × 0.7 s of running = 14 s: one second left of the first rest. (The
    // old tick counter restarted its second on every resume and read 0 here.)
    expect(result.current.displayState).toEqual({ mode: 'phase', stepIndex: 1, timeRemaining: 1 });
  });

  it('a stalled phone wakes on time with one cue, not a burst', async () => {
    const { result } = await startWorkout();
    await advance(2_000);
    const cuesBefore = (firePhaseStart as jest.Mock).mock.calls.length;
    const ticksBefore = (AudioEngine.playTick as jest.Mock).mock.calls.length;
    // 16 s pass with the JS thread frozen (no wake fires), then it wakes.
    mockStall.ms = 16_000;
    await advance(1_000);
    // 19 s in: the second work interval, 6 s left — and it said so once.
    expect(result.current.displayState).toEqual({ mode: 'phase', stepIndex: 2, timeRemaining: 6 });
    expect((firePhaseStart as jest.Mock).mock.calls.length - cuesBefore).toBe(1);
    expect((AudioEngine.playTick as jest.Mock).mock.calls.length - ticksBefore).toBe(0);
  });

  it('finishes once, on time', async () => {
    const { result } = await startWorkout();
    await advance(39_000);
    expect(result.current.displayState.mode).toBe('phase');
    await advance(1_000);
    expect(result.current.displayState.mode).toBe('complete');
    await advance(10_000);
    expect(playComplete).toHaveBeenCalledTimes(1);
  });

  it('a resume hands the Lock Screen the step start back-dated to the paused moment', async () => {
    const { result } = await startWorkout();
    await advance(12_400); // 2.4 s into the first rest
    await act(() => result.current.togglePause());
    await advance(60_000);
    await act(() => result.current.togglePause());
    const input = (startLiveTimer as jest.Mock).mock.calls.at(-1)![0];
    expect(input.phases[0]).toMatchObject({ id: 'step-1', durationSeconds: 5 });
    expect(input.phaseStartMs).toBe(Date.now() - 2_400);
  });

  it('skip starts the next step with a whole first second', async () => {
    const { result } = await startWorkout();
    await advance(3_600);
    await act(() => result.current.handleSkip());
    await advance(999);
    expect(result.current.displayState).toEqual({ mode: 'phase', stepIndex: 1, timeRemaining: 5 });
    await advance(1);
    expect(result.current.displayState).toEqual({ mode: 'phase', stepIndex: 1, timeRemaining: 4 });
  });
});
