/**
 * The active-workout playback wiring — loads the timer, keeps the workout
 * clock (utils/workoutClock) and wakes on each whole second to ask the pure
 * engine (utils/playback) where it should be, fires the audio/haptic cues
 * (audio/workoutCues), and mirrors state into the OS live timer. Extracted
 * from ActiveWorkoutScreen so the screen file is composition and layout only.
 *
 * The position comes from elapsed time on a real clock, never from counting
 * wakes: a late wake catches up, a pause freezes the clock to the millisecond,
 * and the Lock Screen / notification schedule is derived from the same clock,
 * so nothing drifts.
 *
 * State the wake callback reads lives in refs (so `tick` never re-subscribes);
 * each ref-write is mirrored into useState for render.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { PhaseStep, SoundSettings, WorkoutPhase, TimerKind, timerKind } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import { buildWorkoutSequence, getTotalDuration, isOpenEnded } from '../utils/workout';
import {
  type PlaybackState,
  initialPlayback,
  catchUpPlayback,
  goToStep as pbGoToStep,
  skipPlayback,
  backTargetIndex,
  stepStartSeconds,
} from '../utils/playback';
import {
  type WorkoutClock,
  clockElapsed,
  runningAt,
  pauseClock,
  resumeClock,
  seekClock,
  msToNextSecond,
} from '../utils/workoutClock';
import { AudioEngine } from '../audio/AudioEngine';
import {
  firePhaseStart,
  playComplete,
  getMaxCycles,
  speakAndReactivate,
  fireRoundCounted,
} from '../audio/workoutCues';
import { t } from '../i18n';
import {
  startLiveTimer,
  updateLiveTimer,
  endLiveTimer,
  useLiveTimerEvents,
  nowMs,
  type LiveTimerPhase,
} from 'live-timer';

// The rendered position is exactly the playback engine's state (utils/playback).
type DisplayState = PlaybackState;

// Resolve the visible phase label at call time (never a module-level constant —
// canon § Translations: copy must follow the active language).
export const phaseLabel = (phase: WorkoutPhase): string => t(`workout.phase.${phase}`);

// Back control follows the music-player convention: pressing it within the
// first second of an interval jumps to the previous interval; after that it
// restarts the current one.
export const RESTART_THRESHOLD_SECONDS = 1;

export function useWorkoutPlayback(timerId: string, onExit: () => void) {
  const stepsRef = useRef<PhaseStep[]>([]);
  const soundsRef = useRef<SoundSettings | null>(null);
  const totalDurationRef = useRef(0);
  const maxCyclesRef = useRef(0);
  const speechModeRef = useRef(false);
  const clockRef = useRef<WorkoutClock>({ running: false, elapsedMs: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const halfwayFiredRef = useRef(false);
  const sessionIdRef = useRef<string>(`fwt-${Date.now()}`);
  const timerNameRef = useRef<string>('Workout');
  const kindRef = useRef<TimerKind>('intervals');
  const openEndedRef = useRef(false);
  // The round counter (AMRAP / For Time) and the time a count-up workout was
  // finished at — both survive into the complete state for the final readout.
  const roundsRef = useRef(0);
  const [rounds, setRounds] = useState(0);
  const finalElapsedRef = useRef<number | null>(null);

  const stateRef = useRef<DisplayState>({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  const [displayState, setDisplayState] = useState<DisplayState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [timers, settings] = await Promise.all([loadTimers(), loadSettings()]);
      if (cancelled) return;

      const timer = timers.find((tt) => tt.id === timerId);
      if (!timer) {
        Alert.alert(t('workout.errorTitle'), t('workout.timerNotFound'), [
          { text: t('common.ok'), onPress: () => onExit() },
        ]);
        return;
      }

      const steps = buildWorkoutSequence(timer);
      stepsRef.current = steps;
      soundsRef.current = settings.sounds;
      AudioEngine.setVolume(settings.sounds.volume);
      totalDurationRef.current = getTotalDuration(timer);
      maxCyclesRef.current = getMaxCycles(steps);
      speechModeRef.current = settings.audioAccessibilityMode;
      timerNameRef.current = timer.name || 'Workout';
      kindRef.current = timerKind(timer);
      openEndedRef.current = isOpenEnded(timer);

      if (steps.length === 0) return;

      const maxCycles = getMaxCycles(steps);
      AudioEngine.prepare([
        settings.sounds.warmUpStart,
        settings.sounds.workStart,
        settings.sounds.restStart,
        settings.sounds.recoveryStart,
        settings.sounds.coolDownStart,
        settings.sounds.workoutComplete,
        settings.sounds.halfwaySound,
      ]);
      firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      const initial: DisplayState = initialPlayback(steps);
      stateRef.current = initial;
      setDisplayState(initial);
      // The workout's clock starts with its first cue.
      clockRef.current = runningAt(nowMs());
      setLoaded(true);

      await activateKeepAwakeAsync();
      AudioEngine.startKeepAlive().catch(() => {});

      startLiveTimer({
        sessionId: sessionIdRef.current,
        title: timerNameRef.current,
        phases: phasesFrom(steps, 0),
        phaseStartMs: stepStartWallMs(0),
        actions: ['pause', 'skip'],
      }).catch(() => {});
    })();

    return () => {
      cancelled = true;
      deactivateKeepAwake();
      AudioEngine.stopKeepAlive();
      endLiveTimer(sessionIdRef.current).catch(() => {});
    };
  }, [timerId]);

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
        const landed = steps[next.stepIndex];
        firePhaseStart(landed, sounds, steps, maxCyclesRef.current, speechModeRef.current);
        halfwayFiredRef.current = next.timeRemaining <= Math.floor(landed.duration / 2);
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
      stateRef.current = next;
      setDisplayState(next);
      scheduleTick();
      return;
    }

    // event === 'phase-start'
    firePhaseStart(steps[next.stepIndex], sounds, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    stateRef.current = next;
    setDisplayState(next);
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
  function scheduleTick() {
    stopTicking();
    const clock = clockRef.current;
    if (!clock.running) return;
    timeoutRef.current = setTimeout(tick, msToNextSecond(clock, nowMs()));
  }

  function stopTicking() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  // Wall-clock time the given step began on the workout clock (in the past for
  // the active step) — what the Lock Screen / notification schedule counts
  // from, so it matches the app to the second, mid-step resumes included.
  function stepStartWallMs(idx: number): number {
    const elapsed = clockElapsed(clockRef.current, nowMs());
    return Date.now() - (elapsed - stepStartSeconds(stepsRef.current, idx) * 1000);
  }

  /**
   * Land in the complete state from position `from`. For a count-up step the
   * elapsed time at that moment is kept as the final time (reaching the cap
   * counts the whole cap).
   */
  const finishWorkout = (next: DisplayState, from: DisplayState) => {
    const cur = stepsRef.current[from.stepIndex];
    if (cur?.countUp) finalElapsedRef.current = cur.duration - from.timeRemaining;
    playComplete(soundsRef.current!, speechModeRef.current);
    stateRef.current = next;
    setDisplayState(next);
    stopTicking();
    clockRef.current = pauseClock(clockRef.current, nowMs());
    setIsRunning(false);
    endLiveTimer(sessionIdRef.current).catch(() => {});
  };

  useEffect(() => {
    if (loaded) {
      setIsRunning(clockRef.current.running);
      scheduleTick();
    }
    return stopTicking;
  }, [loaded]);

  // A phone that slept or was throttled wakes late; catch up the moment the
  // app is back in front rather than at the next scheduled wake.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !clockRef.current.running) return;
      stopTicking();
      tick();
    });
    return () => sub.remove();
  }, []);

  // Completion is no longer a prompt moment: the app shell counts sessions and
  // owns the review-prompt trigger (canon § Review prompt), and the tip jar is
  // user-initiated only (Settings Support row, timer-list support link).

  const togglePause = () => {
    if (displayState.mode === 'complete') return;
    if (clockRef.current.running) {
      clockRef.current = pauseClock(clockRef.current, nowMs());
      stopTicking();
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
    } else {
      clockRef.current = resumeClock(clockRef.current, nowMs());
      setIsRunning(true);
      scheduleTick();
      const s = stateRef.current;
      const steps = stepsRef.current;
      const cur = steps[s.stepIndex];
      if (cur && s.timeRemaining > 0) {
        // The active step's start is back-dated to where the clock stands, so
        // the Lock Screen / notification countdown (or count-up stopwatch)
        // continues from the paused moment, to the millisecond.
        startLiveTimer({
          sessionId: sessionIdRef.current,
          title: timerNameRef.current,
          phases: phasesFrom(steps, s.stepIndex),
          phaseStartMs: stepStartWallMs(s.stepIndex),
          actions: ['pause', 'skip'],
        }).catch(() => {});
      }
    }
  };

  // Move to an arbitrary step and (re)start it from its full duration. Shared
  // by the back control (restart / previous) and skip — stepping between
  // intervals is the same operation regardless of direction.
  const goToStep = (idx: number) => {
    const steps = stepsRef.current;
    const step = steps[idx];
    if (!step) return;
    firePhaseStart(step, soundsRef.current!, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    const next: DisplayState = pbGoToStep(steps, idx);
    stateRef.current = next;
    setDisplayState(next);
    // The clock jumps to the step's start, so its first second is a whole one.
    clockRef.current = seekClock(clockRef.current, nowMs(), stepStartSeconds(steps, idx) * 1000);
    scheduleTick();
    updateLiveTimer({
      sessionId: sessionIdRef.current,
      phases: phasesFrom(steps, idx),
      phaseStartMs: stepStartWallMs(idx),
    }).catch(() => {});
  };

  // Back control, music-player style: restart the current interval, or — if
  // we're only a beat into it — jump back to the previous interval. On the
  // first interval there's nowhere to go back to, so it always restarts.
  const handleBack = () => {
    if (displayState.mode === 'complete') return;
    const s = stateRef.current;
    const currentStep = stepsRef.current[s.stepIndex];
    if (!currentStep) return;
    goToStep(backTargetIndex(s, currentStep.duration, RESTART_THRESHOLD_SECONDS));
  };

  const handleSkip = () => {
    if (displayState.mode === 'complete') return;
    const s = stateRef.current;
    const steps = stepsRef.current;
    const { next, event } = skipPlayback(steps, s);

    if (event === 'complete') {
      finishWorkout(next, s);
      return;
    }

    goToStep(next.stepIndex);
  };

  /**
   * Finish an AMRAP / For Time early (or stop the For Time clock). Asks first,
   * because one stray tap would end a timed effort with no way back — but the
   * state captured is the moment of the tap, so the recorded time is the
   * athlete's, not the dialog's.
   */
  const handleFinish = () => {
    if (displayState.mode === 'complete') return;
    const at = stateRef.current;
    const steps = stepsRef.current;
    Alert.alert(t('workout.finish'), t('workout.finishBody'), [
      { text: t('workout.keepGoing'), style: 'cancel' },
      {
        text: t('workout.finishShort'),
        onPress: () => {
          if (stateRef.current.mode === 'complete') return;
          const next = { mode: 'complete' as const, stepIndex: steps.length - 1, timeRemaining: 0 };
          finishWorkout(next, at);
        },
      },
    ]);
  };

  // The round counter (AMRAP / For Time). A tap is the one eyes-free action
  // in those modes, so it clicks and buzzes; undo is quieter.
  const countRound = () => {
    if (displayState.mode === 'complete') return;
    roundsRef.current += 1;
    setRounds(roundsRef.current);
    fireRoundCounted(roundsRef.current, speechModeRef.current);
  };

  const undoRound = () => {
    if (displayState.mode === 'complete' || roundsRef.current === 0) return;
    roundsRef.current -= 1;
    setRounds(roundsRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  // Run the same workout again from the top, straight from the complete
  // screen. Keep-awake and the silent keep-alive are still held (they're only
  // released on unmount), so this is the load path's start sequence again,
  // with the round count and final time cleared.
  const restart = () => {
    const steps = stepsRef.current;
    if (steps.length === 0) return;
    roundsRef.current = 0;
    setRounds(0);
    finalElapsedRef.current = null;
    halfwayFiredRef.current = false;
    firePhaseStart(steps[0], soundsRef.current!, steps, maxCyclesRef.current, speechModeRef.current);
    const initial: DisplayState = initialPlayback(steps);
    stateRef.current = initial;
    setDisplayState(initial);
    clockRef.current = runningAt(nowMs());
    setIsRunning(true);
    scheduleTick();
    startLiveTimer({
      sessionId: sessionIdRef.current,
      title: timerNameRef.current,
      phases: phasesFrom(steps, 0),
      phaseStartMs: stepStartWallMs(0),
      actions: ['pause', 'skip'],
    }).catch(() => {});
  };

  const handleStop = () => {
    Alert.alert(t('workout.stopWorkout'), t('workout.stopBody'), [
      { text: t('workout.keepGoing'), style: 'cancel' },
      {
        text: t('workout.stop'),
        style: 'destructive',
        onPress: () => {
          stopTicking();
          endLiveTimer(sessionIdRef.current).catch(() => {});
          onExit();
        },
      },
    ]);
  };

  useLiveTimerEvents((e) => {
    if (e.type !== 'action') return;
    if (e.sessionId !== sessionIdRef.current) return;
    if (e.action === 'pause' || e.action === 'resume') togglePause();
    else if (e.action === 'skip') handleSkip();
    else if (e.action === 'stop') handleStop();
  });

  return {
    displayState,
    isRunning,
    loaded,
    // Ref reads are current by the time anything renders — the load effect
    // fills them before flipping `loaded`.
    steps: stepsRef.current,
    totalDuration: totalDurationRef.current,
    maxCycles: maxCyclesRef.current,
    togglePause,
    handleBack,
    handleSkip,
    handleStop,
    handleFinish,
    restart,
    kind: kindRef.current,
    openEnded: openEndedRef.current,
    rounds,
    countRound,
    undoRound,
    finalElapsed: finalElapsedRef.current,
  };
}

// Returns every remaining phase from `idx` onward, each at its full duration
// (a mid-step resume back-dates the start instead). The native module on
// iOS uses the full list to schedule its own boundary timer, so phase
// transitions don't depend on the JS bridge being awake.
function phasesFrom(steps: PhaseStep[], idx: number): LiveTimerPhase[] {
  const out: LiveTimerPhase[] = [];
  for (let i = idx; i < steps.length; i++) {
    out.push({
      id: `step-${i}`,
      // A named interval shows its own name on the Lock Screen / notification.
      label: steps[i].label ?? phaseLabel(steps[i].phase),
      durationSeconds: steps[i].duration,
      ...(steps[i].countUp ? { countsUp: true } : {}),
    });
  }
  return out;
}
