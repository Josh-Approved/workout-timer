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
 * Class mode (beta): the same driver, but the clock comes from the class's
 * shared timeline (class/timeline) rather than this phone's taps. The
 * instructor's controls write commands into the timeline and publish it over
 * the class relay; every phone, the instructor's included, applies each
 * command when it lands. A member's pause steps only that phone out, until
 * Back in sync puts it back where the class is.
 *
 * State the wake callback reads lives in refs (so `tick` never re-subscribes);
 * each ref-write is mirrored into useState for render.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { PhaseStep, SoundSettings, TimerConfig, WorkoutPhase, TimerKind, timerKind } from '../types';
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
  positionAt,
  elapsedSeconds,
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
  wakeAfter,
  cancelWake,
  type LiveTimerPhase,
  type LiveTimerActionId,
} from 'live-timer';
import {
  type ClassCommand,
  type ClassTimeline,
  classClockAt,
  nextCommand,
  toggleClassPause,
  classSkip,
  classBack,
  classFinish,
} from '../class/timeline';
import { ClassRelay, PULSE_MS } from '../class/relay';
import { classCodeUrl } from '../class/classCode';
import { type ClassSession, saveClassSession, clearClassSession } from '../class/session';

// The rendered position is exactly the playback engine's state (utils/playback).
type DisplayState = PlaybackState;

// Resolve the visible phase label at call time (never a module-level constant —
// canon § Translations: copy must follow the active language).
export const phaseLabel = (phase: WorkoutPhase): string => t(`workout.phase.${phase}`);

// Back control follows the music-player convention: pressing it within the
// first second of an interval jumps to the previous interval; after that it
// restarts the current one.
export const RESTART_THRESHOLD_SECONDS = 1;

/** A saved timer, or a class this phone is in (class mode). */
export type WorkoutSource = { timerId: string } | { classSession: ClassSession };

/** What the screen shows about the class this phone is in. */
export interface ClassView {
  role: 'host' | 'member';
  /** A relay is reachable, so the instructor's commands can travel. */
  live: boolean;
  /** Seconds until the class starts; null once it has. */
  startsIn: number | null;
  /** The next instructor command still to land, and how soon. */
  pending: { action: ClassCommand['action']; inSec: number } | null;
  /** A member paused their own phone and is out of step until Back in sync. */
  steppedOut: boolean;
  /** A member who joined mid-class is waiting to hear the class's state. */
  connecting: boolean;
}

/** Taps on the instructor's controls closer together than this are one tap. */
const HOST_TAP_DEBOUNCE_MS = 500;
/** How long a mid-class joiner waits to hear the class before running on schedule. */
const JOIN_HOLD_MS = 5000;

export function useWorkoutPlayback(source: WorkoutSource, onExit: () => void) {
  const classSource = 'classSession' in source ? source.classSession : null;
  const sourceKey = classSource ? classSource.invite : (source as { timerId: string }).timerId;
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

  // Class mode. `gathering` holds until the class's first second, so the start
  // (or a late join) is announced; `jumps` counts the instructor's jumps
  // applied, so a new one is announced too.
  const classRef = useRef<ClassSession | null>(classSource);
  const relayRef = useRef<ClassRelay | null>(null);
  const relayPulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const classWakeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const steppedOutRef = useRef(false);
  const gatheringRef = useRef(true);
  const jumpsRef = useRef(0);
  const liveRef = useRef(false);
  // Whether the on-screen timer is up in class mode (it stays up the whole
  // class: start countdown, running, paused), the last instructor tap, and —
  // for a member who joined mid-class — whether the class has been heard yet.
  const liveOnRef = useRef(false);
  const lastHostTapRef = useRef(-Infinity);
  const heardRef = useRef(false);
  const holdUntilRef = useRef(0);
  const [classView, setClassView] = useState<ClassView | null>(null);

  const stateRef = useRef<DisplayState>({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  const [displayState, setDisplayState] = useState<DisplayState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cs = classRef.current;
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
      // A class starts when the class does (applyClass), not on load.
      if (!cs) firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      const initial: DisplayState = initialPlayback(steps);
      stateRef.current = initial;
      setDisplayState(initial);
      // The workout's clock starts with its first cue.
      clockRef.current = cs ? { running: false, elapsedMs: 0 } : runningAt(nowMs());
      setLoaded(true);

      await activateKeepAwakeAsync();
      AudioEngine.startKeepAlive().catch(() => {});
      if (cancelled) return;

      if (cs) {
        startClass(cs);
        return;
      }

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
      if (classWakeRef.current) clearTimeout(classWakeRef.current);
      if (relayPulseRef.current) clearTimeout(relayPulseRef.current);
      cancelWake('class');
      cancelWake('relay');
      relayRef.current?.close();
      relayRef.current = null;
    };
  }, [sourceKey]);

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
    devClassLog('step', next.stepIndex);
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
    liveOnRef.current = false;
    // The class is over for this phone: nothing left to rejoin, and nothing
    // left to say on the relay ("online only while you're in a class").
    if (classRef.current) {
      clearClassSession();
      closeRelay();
    }
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
      if (next !== 'active') return;
      if (classRef.current) {
        applyClass();
        return;
      }
      if (!clockRef.current.running) return;
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
    const cs = classRef.current;
    if (cs) {
      // The instructor pauses (or counts back in) the whole class; a member
      // only steps their own phone out, or back in sync.
      if (cs.role === 'host') {
        if (classNow() >= cs.timeline.startAt && hostTap()) {
          commitTimeline(toggleClassPause(stepsRef.current, cs.timeline, classNow()), true);
        }
      } else if (steppedOutRef.current) backInSync();
      // A member can only step out of a class that is running; their play
      // button does nothing while the class gathers or the instructor pauses.
      else if (clockRef.current.running) stepOut();
      return;
    }
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
    const cs = classRef.current;
    if (cs) {
      if (cs.role === 'host' && classNow() >= cs.timeline.startAt && hostTap()) {
        const tl = classBack(stepsRef.current, cs.timeline, classNow(), RESTART_THRESHOLD_SECONDS);
        if (tl !== cs.timeline) commitTimeline(tl, true);
      }
      return;
    }
    const s = stateRef.current;
    const currentStep = stepsRef.current[s.stepIndex];
    if (!currentStep) return;
    goToStep(backTargetIndex(s, currentStep.duration, RESTART_THRESHOLD_SECONDS));
  };

  const handleSkip = () => {
    if (displayState.mode === 'complete') return;
    const cs = classRef.current;
    if (cs) {
      if (cs.role === 'host' && classNow() >= cs.timeline.startAt && hostTap()) {
        const tl = classSkip(stepsRef.current, cs.timeline, classNow());
        if (tl !== cs.timeline) commitTimeline(tl, true);
      }
      return;
    }
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
    const cs = classRef.current;
    if (cs?.role === 'host') {
      // The instructor ends the timed block for the whole class.
      Alert.alert(t('classMode.finishClassTitle'), t('classMode.finishClassBody'), [
        { text: t('workout.keepGoing'), style: 'cancel' },
        {
          text: t('classMode.finishClass'),
          onPress: () => {
            const live = classRef.current;
            if (!live || classNow() < live.timeline.startAt) return;
            const tl = classFinish(stepsRef.current, live.timeline, classNow());
            if (tl !== live.timeline) commitTimeline(tl, true);
          },
        },
      ]);
      return;
    }
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
    if (steps.length === 0 || classRef.current) return;
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
    const inClass = classRef.current != null;
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
            if (inClass) clearClassSession();
            onExit();
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // Class mode (beta)
  // ---------------------------------------------------------------------------

  /** Class time on this phone: its workout clock plus its line-up offset. */
  function classNow(): number {
    return nowMs() + (classRef.current?.offsetMs ?? 0);
  }

  // Members' Lock Screen / notification is display-only: stepping out of a
  // class from the lock screen would leave no way back from there.
  function classActions(running: boolean): LiveTimerActionId[] {
    if (classRef.current?.role !== 'host') return [];
    return running ? ['pause', 'skip'] : ['resume'];
  }

  /**
   * A fumbled burst of instructor taps is one tap: a tap counts only after
   * HOST_TAP_DEBOUNCE_MS of no tapping (each tap restarts the window, so a
   * triple tap can't sneak a second toggle in).
   */
  function hostTap(): boolean {
    const now = nowMs();
    const quiet = now - lastHostTapRef.current >= HOST_TAP_DEBOUNCE_MS;
    lastHostTapRef.current = now;
    return quiet;
  }

  // The relay's heartbeat / watchdog, armed natively too (see scheduleTick).
  function scheduleRelayPulse() {
    if (relayPulseRef.current) clearTimeout(relayPulseRef.current);
    relayPulseRef.current = setTimeout(relayPulse, PULSE_MS);
    wakeAfter('relay', PULSE_MS);
  }

  function relayPulse() {
    relayPulseRef.current = null;
    if (!relayRef.current) return;
    relayRef.current.pulse();
    scheduleRelayPulse();
  }

  function closeRelay() {
    if (relayPulseRef.current) clearTimeout(relayPulseRef.current);
    relayPulseRef.current = null;
    cancelWake('relay');
    relayRef.current?.close();
    relayRef.current = null;
  }

  /**
   * The on-screen timer in class mode. It stays up for the whole class — the
   * countdown to the start, the running steps, and a paused state — because
   * on Android its foreground service is what keeps the phone awake enough
   * for the native wakes to fire with the screen off.
   */
  function showClassLiveTimer(phases: LiveTimerPhase[], phaseStartMs: number, actions: LiveTimerActionId[]) {
    if (liveOnRef.current) {
      updateLiveTimer({ sessionId: sessionIdRef.current, phases, phaseStartMs, actions }).catch(() => {});
      return;
    }
    liveOnRef.current = true;
    startLiveTimer({
      sessionId: sessionIdRef.current,
      title: timerNameRef.current,
      phases,
      phaseStartMs,
      actions,
    }).catch(() => {});
  }

  function hideClassLiveTimer() {
    if (!liveOnRef.current) return;
    liveOnRef.current = false;
    endLiveTimer(sessionIdRef.current).catch(() => {});
  }

  function startClass(cs: ClassSession) {
    saveClassSession(cs);
    // A member arriving after the start waits briefly to hear the class's
    // state (pauses, jumps) before falling back to the bare schedule.
    heardRef.current = cs.role === 'host';
    if (cs.role === 'member' && classNow() > cs.timeline.startAt) holdUntilRef.current = nowMs() + JOIN_HOLD_MS;
    const relay = new ClassRelay({
      key: cs.key,
      hostPub: cs.hostPub,
      hostSecret: cs.hostSecret,
      onTimeline: receiveTimeline,
      onHeard: () => {
        if (heardRef.current) return;
        heardRef.current = true;
        applyClass();
      },
      onLive: (live) => {
        liveRef.current = live;
        refreshClassView();
      },
    });
    relayRef.current = relay;
    relay.start();
    scheduleRelayPulse();
    if (cs.role === 'host') relay.publish(cs.timeline);
    if (__DEV__) console.log('[class] code', classCodeUrl(cs.invite, classNow(), Date.now()));
    applyClass();
  }

  // A newer timeline from the instructor, over the relay.
  function receiveTimeline(tl: ClassTimeline) {
    const cs = classRef.current;
    if (!cs || tl.seq <= cs.timeline.seq || tl.startAt !== cs.timeline.startAt) return;
    commitTimeline(tl, false);
  }

  function commitTimeline(tl: ClassTimeline, publish: boolean) {
    const cs = classRef.current;
    if (!cs) return;
    const next = { ...cs, timeline: tl };
    classRef.current = next;
    saveClassSession(next);
    if (publish) relayRef.current?.publish(tl);
    applyClass();
  }

  /**
   * Bring this phone to where the class is right now. Runs on load, on every
   * timeline change, when the start or a command lands, on return to the
   * foreground, and on Back in sync. Forward motion is left to `tick` (which
   * plays the second(s) crossed, like solo); a jump, the start and a late join
   * are announced; a pause that reached this phone late steps it back quietly.
   */
  function applyClass(announce = false) {
    const cs = classRef.current;
    const steps = stepsRef.current;
    if (!cs || steps.length === 0) return;
    scheduleClassWake();
    refreshClassView();
    if (stateRef.current.mode === 'complete' || steppedOutRef.current) return;
    const local = nowMs();
    const cc = classClockAt(steps, cs.timeline, local + cs.offsetMs);
    if (!cc.started) {
      // Counting down to the start, on the Lock Screen / notification too.
      if (!liveOnRef.current) {
        const waitMs = -cc.elapsedMs;
        const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
        showClassLiveTimer(
          [{ id: 'gathering', label: t('classMode.classStartsIn'), durationSeconds: waitSec }, ...phasesFrom(steps, 0)],
          Date.now() + waitMs - waitSec * 1000,
          [],
        );
      }
      return;
    }
    if (!heardRef.current && local < holdUntilRef.current) return; // connecting

    const prev = stateRef.current;
    const target = positionAt(steps, cc.elapsedMs);
    const jumped = announce || gatheringRef.current || cc.jumps !== jumpsRef.current;
    gatheringRef.current = false;
    jumpsRef.current = cc.jumps;
    const wasRunning = clockRef.current.running;
    clockRef.current = cc.running
      ? runningAt(local, cc.elapsedMs)
      : { running: false, elapsedMs: cc.elapsedMs };
    setIsRunning(cc.running);
    stopTicking();

    if (target.mode === 'complete') {
      finishWorkout(target, prev);
      return;
    }
    if (jumped) {
      const step = steps[target.stepIndex];
      firePhaseStart(step, soundsRef.current!, steps, maxCyclesRef.current, speechModeRef.current);
      devClassLog('jump', target.stepIndex);
      halfwayFiredRef.current =
        target.timeRemaining < step.duration && target.timeRemaining <= Math.floor(step.duration / 2);
      stateRef.current = target;
      setDisplayState(target);
    } else if (!cc.running || elapsedSeconds(steps, prev) > elapsedSeconds(steps, target)) {
      // Paused: show exactly where the class stopped (no tick will move us
      // there). Running but ahead: a pause reached this phone late, so step
      // back to the class quietly.
      stateRef.current = target;
      setDisplayState(target);
    }

    const idx = stateRef.current.stepIndex;
    if (cc.running && (!wasRunning || jumped)) {
      showClassLiveTimer(phasesFrom(steps, idx), stepStartWallMs(idx), classActions(true));
    } else if (!cc.running && (wasRunning || jumped || !liveOnRef.current)) {
      showClassLiveTimer(
        [{ id: 'paused', label: t('classMode.pausedLive'), durationSeconds: 6 * 3600, countsUp: true }],
        Date.now(),
        classActions(false),
      );
    }
    if (cc.running !== wasRunning) devClassLog(cc.running ? 'run' : 'pause', stateRef.current.stepIndex);
    if (cc.running) tick();
  }

  // Development builds stamp every class step change with the time of day, so
  // a multi-device test can measure how far apart the phones act (simulators
  // and emulators share the Mac's clock). Never in store builds.
  function devClassLog(what: string, stepIndex: number) {
    const cs = classRef.current;
    if (!__DEV__ || !cs) return;
    console.log(
      `[class] ${Platform.OS} ${cs.role} ${what} step=${stepIndex} running=${clockRef.current.running} wall=${Date.now()}`,
    );
  }

  // Wake exactly when the class starts, or when the next command lands.
  function scheduleClassWake() {
    if (classWakeRef.current) clearTimeout(classWakeRef.current);
    classWakeRef.current = null;
    const cs = classRef.current;
    if (!cs) return;
    const cn = classNow();
    const holdLeft = heardRef.current ? 0 : holdUntilRef.current - nowMs();
    const at =
      cn < cs.timeline.startAt
        ? cs.timeline.startAt
        : holdLeft > 0
          ? cn + holdLeft
          : nextCommand(cs.timeline, cn)?.at;
    if (at == null) {
      cancelWake('class');
      return;
    }
    const ms = Math.max(0, at - cn) + 1;
    classWakeRef.current = setTimeout(() => {
      classWakeRef.current = null;
      applyClass();
    }, ms);
    wakeAfter('class', ms);
  }

  function refreshClassView() {
    const cs = classRef.current;
    if (!cs) return;
    const cn = classNow();
    const waitMs = cs.timeline.startAt - cn;
    const next = waitMs > 0 ? null : nextCommand(cs.timeline, cn);
    const view: ClassView = {
      role: cs.role,
      live: liveRef.current,
      startsIn: waitMs > 0 ? Math.ceil(waitMs / 1000) : null,
      pending: next ? { action: next.action, inSec: Math.max(1, Math.ceil((next.at - cn) / 1000)) } : null,
      steppedOut: steppedOutRef.current,
      connecting: waitMs <= 0 && !heardRef.current && nowMs() < holdUntilRef.current,
    };
    setClassView((prev) => (prev && sameView(prev, view) ? prev : view));
  }

  // A member pauses only their own phone, out of the class's timeline.
  function stepOut() {
    steppedOutRef.current = true;
    clockRef.current = pauseClock(clockRef.current, nowMs());
    stopTicking();
    setIsRunning(false);
    hideClassLiveTimer();
    refreshClassView();
  }

  function backInSync() {
    steppedOutRef.current = false;
    applyClass(true);
  }

  // Countdowns on screen ("Starts in", "Resuming in") tick while one is showing.
  const countingDown =
    classView != null && (classView.startsIn != null || classView.pending != null || classView.connecting);
  useEffect(() => {
    if (!countingDown) return;
    const id = setInterval(refreshClassView, 250);
    return () => clearInterval(id);
  }, [countingDown]);

  useLiveTimerEvents((e) => {
    // A native wake (Android, app not in front): run whatever it stood in for.
    if (e.type === 'wake') {
      if (e.id === 'tick' && timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        tick();
      } else if (e.id === 'class' && classWakeRef.current) {
        clearTimeout(classWakeRef.current);
        classWakeRef.current = null;
        applyClass();
      } else if (e.id === 'relay' && relayPulseRef.current) {
        clearTimeout(relayPulseRef.current);
        relayPulse();
      }
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
    classView,
    /** The class code to draw right now (class mode); redraw it often. */
    classCode: () =>
      classRef.current ? classCodeUrl(classRef.current.invite, classNow(), Date.now()) : null,
  };
}

function sameView(a: ClassView, b: ClassView): boolean {
  return (
    a.role === b.role &&
    a.live === b.live &&
    a.startsIn === b.startsIn &&
    a.steppedOut === b.steppedOut &&
    a.connecting === b.connecting &&
    a.pending?.action === b.pending?.action &&
    a.pending?.inSec === b.pending?.inSec
  );
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
