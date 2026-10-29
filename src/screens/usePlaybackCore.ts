/**
 * The moving part of active-workout playback: the workout clock
 * (utils/workoutClock), the position the screen shows, and the wake on each
 * whole second that asks the pure engine (utils/playback) where it should be
 * and fires the audio/haptic cues it has crossed (audio/workoutCues). The solo
 * controls (useWorkoutPlayback) and class mode (class/useClassDriver) both
 * steer it.
 *
 * The position comes from elapsed time on a real clock, never from counting
 * wakes: a late wake catches up, a pause freezes the clock to the millisecond,
 * and the Lock Screen / notification schedule is derived from the same clock,
 * so nothing drifts.
 *
 * State the wake callback reads lives in refs (so `tick` never re-subscribes);
 * each ref-write is mirrored into useState for render.
 */

import { useRef, useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { PhaseStep, SoundSettings } from '../types';
import { type PlaybackState, catchUpPlayback, stepStartSeconds } from '../utils/playback';
import { type WorkoutClock, clockElapsed, pauseClock, msToNextSecond } from '../utils/workoutClock';
import { AudioEngine } from '../audio/AudioEngine';
import { firePhaseStart, playComplete, speakAndReactivate } from '../audio/workoutCues';
import { startLiveTimer, endLiveTimer, nowMs, wakeAfter, cancelWake } from 'live-timer';
import { phasesFrom } from '../utils/liveTimerPhases';

/** What the steering side hears from the core as the workout plays. */
export interface PlaybackEvents {
  /** A wake played step `idx`'s start. */
  stepStart: (idx: number) => void;
  /** The workout landed in its complete state. */
  finish: () => void;
}

export function usePlaybackCore(on: PlaybackEvents) {
  const stepsRef = useRef<PhaseStep[]>([]);
  const soundsRef = useRef<SoundSettings | null>(null);
  const maxCyclesRef = useRef(0);
  const speechModeRef = useRef(false);
  const clockRef = useRef<WorkoutClock>({ running: false, elapsedMs: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const halfwayFiredRef = useRef(false);
  const sessionIdRef = useRef<string>(`fwt-${Date.now()}`);
  const timerNameRef = useRef<string>('Workout');
  // The time a count-up workout was finished at — it survives into the
  // complete state for the final readout.
  const finalElapsedRef = useRef<number | null>(null);

  const stateRef = useRef<PlaybackState>({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  const [displayState, setDisplayState] = useState<PlaybackState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);

  // A wake: sample the clock and play the second(s) it has crossed. Normally
  // that is exactly one; after a stall the engine skips the in-between seconds
  // silently and plays only the last, so a late phone lands on time without a
  // burst of beeps.
  const tick = useCallback(() => {
    timeoutRef.current = null;
    const clock = clockRef.current;
    if (!clock.running) return;
    const sounds = soundsRef.current!;
    const steps = stepsRef.current;
    const played = catchUpPlayback(steps, stateRef.current, clockElapsed(clock, nowMs()));
    if (!played) {
      scheduleTick();
      return;
    }
    const { from: s, next, event, jumped } = played;

    if (event === 'complete') {
      finishWorkout(next, s);
      return;
    }

    if (event === 'tick') {
      if (jumped) {
        // Landed in a new step during a stall: say where we are, and don't
        // fire a halfway cue that has already gone by.
        announceStep(next.stepIndex, next.timeRemaining <= Math.floor(steps[next.stepIndex].duration / 2));
      }
      const newTime = next.timeRemaining;
      if (sounds.countdownDuration > 0 && newTime <= sounds.countdownDuration) {
        AudioEngine.playTick().catch(() => {});
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const currentStep = steps[s.stepIndex];
      if (
        currentStep &&
        !halfwayFiredRef.current &&
        currentStep.duration >= 4 &&
        sounds.halfwaySound !== 'none' &&
        newTime === Math.floor(currentStep.duration / 2)
      ) {
        const halfStyle = sounds.halfwaySound as string;
        if (halfStyle === 'voice') speakAndReactivate('Halfway');
        else AudioEngine.playSound(sounds.halfwaySound).catch(() => {});
        halfwayFiredRef.current = true;
      }
      setPosition(next);
      scheduleTick();
      return;
    }

    // event === 'phase-start'
    announceStep(next.stepIndex);
    on.stepStart(next.stepIndex);
    setPosition(next);
    scheduleTick();
    // No live-timer call here. iOS encodes the full schedule into the
    // activity's ContentState at start and the widget computes the
    // active phase from Date() on each render — boundary advancement
    // is handled by the schedule itself, not by per-tick updates.
    // Android's foreground service has its own native Handler that
    // advances the notification at boundaries. JS only calls
    // updateLiveTimer for explicit user actions (skip / restart /
    // pause / resume).
  }, []);

  // Wake at the next whole workout second (each wake schedules the next).
  // Declarations, so `tick` above can reach them; they only touch refs.
  // The same wake is armed natively too (live-timer `wakeAfter`): Android
  // stops JS timers while the app isn't in front, and whichever fires first runs.
  function scheduleTick() {
    stopTicking();
    const clock = clockRef.current;
    if (!clock.running) return;
    const ms = msToNextSecond(clock, nowMs());
    timeoutRef.current = setTimeout(tick, ms);
    wakeAfter('tick', ms);
  }

  function stopTicking() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    cancelWake('tick');
  }

  // A native wake (Android, app not in front) standing in for the tick timer.
  function wake(id: string) {
    if (id === 'tick' && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      tick();
    }
  }

  // The position: the ref the wakes read, mirrored into render state.
  function setPosition(next: PlaybackState) {
    stateRef.current = next;
    setDisplayState(next);
  }

  // A step's start cue. `halfwayGone` marks its halfway cue as already past,
  // for a step landed on part-way through.
  function announceStep(idx: number, halfwayGone = false) {
    const steps = stepsRef.current;
    firePhaseStart(steps[idx], soundsRef.current!, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = halfwayGone;
  }

  // Wall-clock time the given step began on the workout clock (in the past for
  // the active step) — what the Lock Screen / notification schedule counts
  // from, so it matches the app to the second, mid-step resumes included.
  function stepStartWallMs(idx: number): number {
    const elapsed = clockElapsed(clockRef.current, nowMs());
    return Date.now() - (elapsed - stepStartSeconds(stepsRef.current, idx) * 1000);
  }

  // Put up the Lock Screen / notification timer for a solo workout, from step
  // `idx` (its start back-dated to where the clock stands).
  function showLiveTimer(idx: number) {
    startLiveTimer({
      sessionId: sessionIdRef.current,
      title: timerNameRef.current,
      phases: phasesFrom(stepsRef.current, idx),
      phaseStartMs: stepStartWallMs(idx),
      actions: ['pause', 'skip'],
    }).catch(() => {});
  }

  /**
   * Land in the complete state from position `from`. For a count-up step the
   * elapsed time at that moment is kept as the final time (reaching the cap
   * counts the whole cap).
   */
  const finishWorkout = (next: PlaybackState, from: PlaybackState) => {
    const cur = stepsRef.current[from.stepIndex];
    if (cur?.countUp) finalElapsedRef.current = cur.duration - from.timeRemaining;
    playComplete(soundsRef.current!, speechModeRef.current);
    setPosition(next);
    stopTicking();
    clockRef.current = pauseClock(clockRef.current, nowMs());
    setIsRunning(false);
    endLiveTimer(sessionIdRef.current).catch(() => {});
    on.finish();
  };

  return {
    stepsRef,
    soundsRef,
    maxCyclesRef,
    speechModeRef,
    clockRef,
    stateRef,
    sessionIdRef,
    timerNameRef,
    finalElapsedRef,
    displayState,
    isRunning,
    setIsRunning,
    tick,
    scheduleTick,
    stopTicking,
    wake,
    setPosition,
    announceStep,
    stepStartWallMs,
    showLiveTimer,
    finishWorkout,
  };
}
