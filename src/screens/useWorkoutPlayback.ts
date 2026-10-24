/**
 * The active-workout playback wiring — loads the timer, drives the 1-second
 * interval over the pure engine (utils/playback), fires the audio/haptic cues
 * (audio/workoutCues), and mirrors state into the OS live timer. Extracted
 * from ActiveWorkoutScreen so the screen file is composition and layout only.
 *
 * State the interval callback reads lives in refs (so `tick` never
 * re-subscribes); each ref-write is mirrored into useState for render.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { PhaseStep, SoundSettings, WorkoutPhase } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import { buildWorkoutSequence, getTotalDuration } from '../utils/workout';
import {
  type PlaybackState,
  initialPlayback,
  advancePlayback,
  goToStep as pbGoToStep,
  skipPlayback,
  backTargetIndex,
} from '../utils/playback';
import { AudioEngine } from '../audio/AudioEngine';
import {
  firePhaseStart,
  playComplete,
  getMaxCycles,
  speakAndReactivate,
} from '../audio/workoutCues';
import { t } from '../i18n';
import {
  startLiveTimer,
  updateLiveTimer,
  endLiveTimer,
  useLiveTimerEvents,
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
  const isRunningRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const halfwayFiredRef = useRef(false);
  const sessionIdRef = useRef<string>(`fwt-${Date.now()}`);
  const timerNameRef = useRef<string>('Workout');

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

      if (steps.length === 0) return;

      const maxCycles = getMaxCycles(steps);
      firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      const initial: DisplayState = initialPlayback(steps);
      stateRef.current = initial;
      setDisplayState(initial);
      setLoaded(true);

      await activateKeepAwakeAsync();
      AudioEngine.startKeepAlive().catch(() => {});

      startLiveTimer({
        sessionId: sessionIdRef.current,
        title: timerNameRef.current,
        phases: phasesFrom(steps, 0),
        phaseStartMs: Date.now(),
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

  const tick = useCallback(() => {
    const s = stateRef.current;
    const sounds = soundsRef.current!;
    const steps = stepsRef.current;
    const { next, event } = advancePlayback(steps, s);

    if (event === 'tick') {
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
      return;
    }

    if (event === 'complete') {
      playComplete(sounds, speechModeRef.current);
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
      return;
    }

    // event === 'phase-start'
    firePhaseStart(steps[next.stepIndex], sounds, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    stateRef.current = next;
    setDisplayState(next);
    // No live-timer call here. iOS encodes the full schedule into the
    // activity's ContentState at start and the widget computes the
    // active phase from Date() on each render — boundary advancement
    // is handled by the schedule itself, not by per-tick updates.
    // Android's foreground service has its own native Handler that
    // advances the notification at boundaries. JS only calls
    // updateLiveTimer for explicit user actions (skip / restart /
    // pause / resume).
  }, []);

  const startInterval = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (loaded) {
      isRunningRef.current = true;
      setIsRunning(true);
      startInterval();
    }
    return stopInterval;
  }, [loaded]);

  // Completion is no longer a prompt moment: the app shell counts sessions and
  // owns the review-prompt trigger (canon § Review prompt), and the tip jar is
  // user-initiated only (Settings Support row, timer-list support link).

  const togglePause = () => {
    if (displayState.mode === 'complete') return;
    if (isRunningRef.current) {
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
    } else {
      isRunningRef.current = true;
      setIsRunning(true);
      startInterval();
      const s = stateRef.current;
      const steps = stepsRef.current;
      const remaining = s.timeRemaining;
      if (steps[s.stepIndex] && remaining > 0) {
        startLiveTimer({
          sessionId: sessionIdRef.current,
          title: timerNameRef.current,
          phases: phasesFrom(steps, s.stepIndex, remaining),
          phaseStartMs: Date.now(),
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
    updateLiveTimer({
      sessionId: sessionIdRef.current,
      phases: phasesFrom(steps, idx),
      phaseStartMs: Date.now(),
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
      playComplete(soundsRef.current!, speechModeRef.current);
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
      return;
    }

    goToStep(next.stepIndex);
  };

  // Run the same workout again from the top, straight from the complete
  // screen. Keep-awake and the silent keep-alive are still held (they're only
  // released on unmount), so this is the load path's start sequence again.
  const restart = () => {
    const steps = stepsRef.current;
    if (steps.length === 0) return;
    firePhaseStart(steps[0], soundsRef.current!, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    const initial: DisplayState = initialPlayback(steps);
    stateRef.current = initial;
    setDisplayState(initial);
    isRunningRef.current = true;
    setIsRunning(true);
    startInterval();
    startLiveTimer({
      sessionId: sessionIdRef.current,
      title: timerNameRef.current,
      phases: phasesFrom(steps, 0),
      phaseStartMs: Date.now(),
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
          stopInterval();
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
    restart,
  };
}

// Returns every remaining phase from `idx` onward. The native module on
// iOS uses the full list to schedule its own boundary timer, so phase
// transitions don't depend on the JS bridge being awake.
// `activeOverrideSeconds` shortens the active phase only — used when
// resuming from pause with partial time remaining.
function phasesFrom(
  steps: PhaseStep[],
  idx: number,
  activeOverrideSeconds?: number,
): LiveTimerPhase[] {
  const out: LiveTimerPhase[] = [];
  for (let i = idx; i < steps.length; i++) {
    out.push({
      id: `step-${i}`,
      label: phaseLabel(steps[i].phase),
      durationSeconds:
        i === idx && activeOverrideSeconds != null
          ? activeOverrideSeconds
          : steps[i].duration,
    });
  }
  return out;
}
