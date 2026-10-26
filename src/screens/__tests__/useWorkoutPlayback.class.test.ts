/**
 * Class mode end to end in one process: an instructor's phone and members'
 * phones (real useWorkoutPlayback hooks) joined through an in-memory relay
 * that can delay and drop messages. The standing regression for "the class
 * stays in step": start, class pause and count-in, class skip, a member
 * stepping out and back in, a late join, and a dropped command recovered on
 * reconnect. Device-level chaos (real relays, real radios) is the two-device
 * harness's job; this one runs on every `npm test`.
 */

import { renderHook, act } from '@testing-library/react-native';

const mockTimer = {
  id: 't',
  name: 'Class check',
  createdAt: 0,
  updatedAt: 0,
  initialCountdown: 0,
  warmUp: 0,
  exercise: 20,
  rest: 10,
  sets: 4,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
};

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('../../storage/storage', () => ({
  loadTimers: jest.fn(async () => []),
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
jest.mock('live-timer', () => ({
  startLiveTimer: jest.fn(async () => {}),
  updateLiveTimer: jest.fn(async () => {}),
  endLiveTimer: jest.fn(async () => {}),
  useLiveTimerEvents: () => {},
  wakeAfter: () => {},
  cancelWake: () => {},
  nowMs: () => Date.now(),
}));

// The in-memory relay: the instructor's deposits reach every member after
// `delayMs`, unless `drop` is on; `reconnect()` replays the latest deposit,
// as the real relays' stored slot does.
const mockBus = {
  delayMs: 300,
  drop: false,
  latest: null as unknown,
  members: new Set<(tl: unknown) => void>(),
  reconnect() {
    const tl = this.latest;
    if (tl) this.members.forEach((fn) => fn(tl));
  },
};
jest.mock('../../class/relay', () => {
  const actual = jest.requireActual('../../class/relay');
  class FakeRelay {
    private deliver: (tl: unknown) => void;
    constructor(
      private mockOpts: {
        hostSecret?: string;
        onTimeline: (tl: unknown) => void;
        onHeard?: () => void;
        onLive: (l: boolean) => void;
      },
    ) {
      // As the real relay: a newer timeline first, then "heard".
      this.deliver = (tl) => {
        this.mockOpts.onTimeline(tl);
        this.mockOpts.onHeard?.();
      };
    }
    start() {
      if (!this.mockOpts.hostSecret) mockBus.members.add(this.deliver);
      this.mockOpts.onLive(true);
      if (!this.mockOpts.hostSecret && mockBus.latest) {
        const tl = mockBus.latest;
        setTimeout(() => this.deliver(tl), mockBus.delayMs);
      }
    }
    close() {
      mockBus.members.delete(this.deliver);
    }
    publish(tl: unknown) {
      mockBus.latest = tl;
      if (mockBus.drop) return;
      mockBus.members.forEach((fn) => setTimeout(() => fn(tl), mockBus.delayMs));
    }
  }
  return { ...actual, ClassRelay: FakeRelay };
});

import { useWorkoutPlayback } from '../useWorkoutPlayback';
import { hostSession, memberSession } from '../../class/session';
import { parseClassCode, classCodeUrl } from '../../class/classCode';
import { COMMAND_LEAD_MS, RESUME_LEAD_MS } from '../../class/timeline';
import { firePhaseStart } from '../../audio/workoutCues';

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};

async function startClass(startInMs = 5_000) {
  const host = hostSession(mockTimer, startInMs, Date.now(), Date.now())!;
  const hostHook = await renderHook(() => useWorkoutPlayback({ classSession: host }, jest.fn()));
  await settle();
  return { host, hostHook };
}

async function join(host: NonNullable<ReturnType<typeof hostSession>>) {
  const parsed = parseClassCode(classCodeUrl(host.invite, Date.now(), Date.now()))!;
  const member = memberSession(parsed.invite, parsed.inviteCode, 0, Date.now(), Date.now());
  const hook = await renderHook(() => useWorkoutPlayback({ classSession: member }, jest.fn()));
  await settle();
  return hook;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 2_000_000 });
  jest.clearAllMocks();
  mockBus.delayMs = 300;
  mockBus.drop = false;
  mockBus.latest = null;
  mockBus.members.clear();
});
afterEach(() => jest.useRealTimers());

describe('class mode — phones in one class stay in step', () => {
  it('gathers, then every phone starts on the same instant', async () => {
    const { host, hostHook } = await startClass(5_000);
    const a = await join(host);
    const b = await join(host);
    expect(hostHook.result.current.classView?.startsIn).toBe(5);
    expect(a.result.current.classView?.startsIn).toBe(5);
    expect(firePhaseStart).not.toHaveBeenCalled();
    await advance(5_001);
    expect(firePhaseStart).toHaveBeenCalledTimes(3); // the start, on each phone
    await advance(12_000);
    const at = hostHook.result.current.displayState;
    expect(at).toEqual({ mode: 'phase', stepIndex: 0, timeRemaining: 8 });
    expect(a.result.current.displayState).toEqual(at);
    expect(b.result.current.displayState).toEqual(at);
  });

  it("the instructor's pause lands everywhere at once, and resume counts everyone in", async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 7_000);
    await act(() => hostHook.result.current.togglePause());
    expect(a.result.current.isRunning).toBe(true); // still the lead
    await advance(COMMAND_LEAD_MS + 1);
    expect(hostHook.result.current.isRunning).toBe(false);
    expect(a.result.current.isRunning).toBe(false);
    const paused = hostHook.result.current.displayState;
    await advance(30_000);
    expect(a.result.current.displayState).toEqual(paused);
    await act(() => hostHook.result.current.togglePause());
    await advance(500);
    expect(a.result.current.classView?.pending).toMatchObject({ action: 'resume' });
    await advance(RESUME_LEAD_MS);
    expect(a.result.current.isRunning).toBe(true);
    await advance(4_000);
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it('a class skip moves every phone to the next step together', async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 3_000);
    await act(() => hostHook.result.current.handleSkip());
    await advance(COMMAND_LEAD_MS + 1);
    expect(hostHook.result.current.displayState).toEqual({ mode: 'phase', stepIndex: 1, timeRemaining: 10 });
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it("a member's skip and back do nothing; their pause steps only them out", async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 2_000);
    await act(() => a.result.current.handleSkip());
    await act(() => a.result.current.handleBack());
    await advance(COMMAND_LEAD_MS + 1);
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
    await act(() => a.result.current.togglePause());
    expect(a.result.current.classView?.steppedOut).toBe(true);
    await advance(9_000);
    expect(hostHook.result.current.isRunning).toBe(true);
    expect(a.result.current.displayState).not.toEqual(hostHook.result.current.displayState);
    await act(() => a.result.current.togglePause()); // Back in sync
    expect(a.result.current.classView?.steppedOut).toBe(false);
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it('a late arrival lands exactly where the class is, pauses included', async () => {
    const { host, hostHook } = await startClass(1_000);
    await advance(1_001 + 6_000);
    await act(() => hostHook.result.current.togglePause());
    await advance(COMMAND_LEAD_MS + 20_000);
    await act(() => hostHook.result.current.togglePause());
    await advance(RESUME_LEAD_MS + 9_000);
    const cuesBefore = (firePhaseStart as jest.Mock).mock.calls.length;
    const late = await join(host);
    // It waits to hear the class (here 300 ms) instead of playing the bare
    // schedule, so no wrong step and no wrong cue in between.
    expect(late.result.current.classView?.connecting).toBe(true);
    expect((firePhaseStart as jest.Mock).mock.calls.length).toBe(cuesBefore);
    await advance(400);
    expect(late.result.current.classView?.connecting).toBe(false);
    expect(late.result.current.displayState).toEqual(hostHook.result.current.displayState);
    expect((firePhaseStart as jest.Mock).mock.calls.length).toBe(cuesBefore + 1);
    await advance(3_000);
    expect(late.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it('a dropped pause is recovered on reconnect: the member snaps back to the class', async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 4_000);
    mockBus.drop = true;
    await act(() => hostHook.result.current.togglePause());
    await advance(COMMAND_LEAD_MS + 5_000);
    expect(hostHook.result.current.isRunning).toBe(false);
    expect(a.result.current.isRunning).toBe(true); // never heard it
    mockBus.drop = false;
    await act(() => mockBus.reconnect());
    expect(a.result.current.isRunning).toBe(false);
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it("a member's play does nothing while the class gathers or the instructor has it paused", async () => {
    const { host, hostHook } = await startClass(3_000);
    const a = await join(host);
    await act(() => a.result.current.togglePause()); // during the countdown
    expect(a.result.current.classView?.steppedOut).toBe(false);
    await advance(3_001 + 2_000);
    await act(() => hostHook.result.current.togglePause());
    await advance(COMMAND_LEAD_MS + 1);
    await act(() => a.result.current.togglePause()); // class paused
    expect(a.result.current.classView?.steppedOut).toBe(false);
    await act(() => hostHook.result.current.togglePause());
    await advance(RESUME_LEAD_MS + 2_000);
    expect(a.result.current.isRunning).toBe(true);
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });

  it("a fumbled double tap on the instructor's pause is one pause", async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 3_000);
    await act(() => hostHook.result.current.togglePause());
    await advance(120);
    await act(() => hostHook.result.current.togglePause());
    await advance(COMMAND_LEAD_MS + 3_000);
    expect(hostHook.result.current.isRunning).toBe(false);
    expect(a.result.current.isRunning).toBe(false);
  });

  it("a skip in a step's last moment doesn't also skip the next step", async () => {
    const { host, hostHook } = await startClass(1_000);
    const a = await join(host);
    await advance(1_001 + 19_500); // half a second of the first work interval left
    await act(() => hostHook.result.current.handleSkip());
    await advance(COMMAND_LEAD_MS + 1);
    expect(hostHook.result.current.displayState.stepIndex).toBe(1); // the rest, not the next work
    expect(a.result.current.displayState).toEqual(hostHook.result.current.displayState);
  });
});
