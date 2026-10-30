/**
 * The active-workout playback wiring — loads the timer, starts it, and turns
 * each control into a move of the playback core (usePlaybackCore: the workout
 * clock, the position, the per-second wake and its cues, the OS live timer).
 * Extracted from ActiveWorkoutScreen so the screen file is composition and
 * layout only.
 *
 * Class mode (beta) steers the same core from the class's shared timeline
 * instead of this phone's taps. It lives in class/useClassDriver, and each
 * control here hands it the tap first while this phone is in a class.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { TimerConfig, TimerKind, timerKind } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import { buildWorkoutSequence, getTotalDuration, isOpenEnded } from '../utils/workout';
import {
  type PlaybackState,
  initialPlayback,
  goToStep as pbGoToStep,
  skipPlayback,
  backTargetIndex,
  stepStartSeconds,
} from '../utils/playback';
import { runningAt, pauseClock, resumeClock, seekClock } from '../utils/workoutClock';
import { AudioEngine } from '../audio/AudioEngine';
import { startSoundCheck, endSoundCheck } from '../audio/soundCheck';
import { firePhaseStart, getMaxCycles, fireRoundCounted } from '../audio/workoutCues';
import { t } from '../i18n';
import { updateLiveTimer, endLiveTimer, useLiveTimerEvents, nowMs } from 'live-timer';
import { phasesFrom } from '../utils/liveTimerPhases';
import type { ClassSession } from '../class/session';
import { useClassDriver } from '../class/useClassDriver';
import { usePlaybackCore } from './usePlaybackCore';

export { phaseLabel } from '../utils/liveTimerPhases';

// The rendered position is exactly the playback engine's state (utils/playback).
type DisplayState = PlaybackState;

// Back control follows the music-player convention: pressing it within the
// first second of an interval jumps to the previous interval; after that it
// restarts the current one.
export const RESTART_THRESHOLD_SECONDS = 1;

/** A saved timer, or a class this phone is in (class mode). */
export type WorkoutSource = { timerId: string } | { classSession: ClassSession };

export function useWorkoutPlayback(source: WorkoutSource, onExit: () => void) {
  const classSource = 'classSession' in source ? source.classSession : null;
  const sourceKey = classSource ? classSource.invite : (source as { timerId: string }).timerId;
  // In a class, each step start is stamped for the multi-device tests, and the
  // finish ends the class for this phone. `cls` is set further down, before
  // the core can play anything.
  const core = usePlaybackCore({
    stepStart: (idx) => cls.devLog('step', idx),
    finish: () => cls.finished(),
  });
  const { stepsRef, soundsRef, maxCyclesRef, speechModeRef, clockRef, stateRef } = core;
  const { sessionIdRef, timerNameRef, finalElapsedRef, displayState, isRunning, setIsRunning } = core;
  const { tick, scheduleTick, stopTicking, setPosition, announceStep, stepStartWallMs } = core;
  const { showLiveTimer, finishWorkout } = core;
  const totalDurationRef = useRef(0);
  const kindRef = useRef<TimerKind>('intervals');
  const openEndedRef = useRef(false);
  // The round counter (AMRAP / For Time) — it survives into the complete
  // state for the final readout.
  const roundsRef = useRef(0);
  const [rounds, setRounds] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cs = cls.session();
      const [timers, settings] = await Promise.all([
        cs ? Promise.resolve<TimerConfig[]>([cs.workout]) : loadTimers(),
        loadSettings(),
      ]);
      if (cancelled) return;

      const timer = cs ? cs.workout : timers.find((tt) => tt.id === sourceKey);
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
      // A class starts when the class does (class/useClassDriver), not on load.
      if (!cs) firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      setPosition(initialPlayback(steps));
      // The workout's clock starts with its first cue.
      clockRef.current = cs ? { running: false, elapsedMs: 0 } : runningAt(nowMs());
      setLoaded(true);

      await activateKeepAwakeAsync();
      AudioEngine.startKeepAlive().catch(() => {});
      void startSoundCheck(settings.sounds, settings.audioAccessibilityMode);
      if (cancelled) return;

      if (cs) {
        cls.start(cs);
        return;
      }
      showLiveTimer(0);
    })();

    return () => {
      cancelled = true;
      deactivateKeepAwake();
      AudioEngine.stopKeepAlive();
      void endSoundCheck();
      endLiveTimer(sessionIdRef.current).catch(() => {});
      cls.close();
    };
  }, [sourceKey]);

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
      if (next !== 'active') return;
      if (cls.sync()) return; // in a class: rejoin where the class is
      if (!clockRef.current.running) return;
      stopTicking();
      tick();
    });
    return () => sub.remove();
  }, []);

  // Class mode steers the same core. It comes after the effects above so its
  // own effect runs after theirs; they reach `cls` only from callbacks, by
  // which time it is set.
  const cls = useClassDriver(classSource, core);

  // Completion is no longer a prompt moment: the app shell counts sessions and
  // owns the review-prompt trigger (canon § Review prompt), and the tip jar is
  // user-initiated only (Settings Support row, timer-list support link).

  // Each control below hands its tap to class mode first; `cls.*` returns
  // true when it took it (this phone is in a class).
  const togglePause = () => {
    if (displayState.mode === 'complete' || cls.togglePause()) return;
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
      // The active step's start is back-dated to where the clock stands, so
      // the Lock Screen / notification countdown (or count-up stopwatch)
      // continues from the paused moment, to the millisecond.
      if (stepsRef.current[s.stepIndex] && s.timeRemaining > 0) showLiveTimer(s.stepIndex);
    }
  };

  // Move to an arbitrary step and (re)start it from its full duration. Shared
  // by the back control (restart / previous) and skip — stepping between
  // intervals is the same operation regardless of direction.
  const goToStep = (idx: number) => {
    const steps = stepsRef.current;
    if (!steps[idx]) return;
    announceStep(idx);
    setPosition(pbGoToStep(steps, idx));
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
    if (displayState.mode === 'complete' || cls.back(RESTART_THRESHOLD_SECONDS)) return;
    const s = stateRef.current;
    const currentStep = stepsRef.current[s.stepIndex];
    if (!currentStep) return;
    goToStep(backTargetIndex(s, currentStep.duration, RESTART_THRESHOLD_SECONDS));
  };

  const handleSkip = () => {
    if (displayState.mode === 'complete' || cls.skip()) return;
    const s = stateRef.current;
    const { next, event } = skipPlayback(stepsRef.current, s);

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
    if (displayState.mode === 'complete' || cls.finish()) return;
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
    if (steps.length === 0 || cls.session()) return;
    roundsRef.current = 0;
    setRounds(0);
    finalElapsedRef.current = null;
    announceStep(0);
    setPosition(initialPlayback(steps));
    clockRef.current = runningAt(nowMs());
    setIsRunning(true);
    scheduleTick();
    showLiveTimer(0);
  };

  const handleStop = () => {
    const inClass = cls.session() != null;
    Alert.alert(
      t(inClass ? 'classMode.leaveTitle' : 'workout.stopWorkout'),
      t(inClass ? 'classMode.leaveBody' : 'workout.stopBody'),
      [
        { text: t('workout.keepGoing'), style: 'cancel' },
        {
          text: t(inClass ? 'classMode.leave' : 'workout.stop'),
          style: 'destructive',
          onPress: () => {
            stopTicking();
            endLiveTimer(sessionIdRef.current).catch(() => {});
            if (inClass) cls.leave();
            onExit();
          },
        },
      ],
    );
  };

  useLiveTimerEvents((e) => {
    // A native wake (Android, app not in front): run whatever it stood in for.
    if (e.type === 'wake') {
      core.wake(e.id);
      cls.wake(e.id);
      return;
    }
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
    classView: cls.view,
    /** The class code to draw right now (class mode); redraw it often. */
    classCode: cls.code,
  };
}
