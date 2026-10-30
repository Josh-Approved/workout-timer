/**
 * Class mode (beta) for the playback driver (screens/useWorkoutPlayback): the
 * same clock and position, but the clock comes from the class's shared
 * timeline (class/timeline) rather than this phone's taps. The instructor's
 * controls write commands into the timeline and publish it over the class
 * relay; every phone, the instructor's included, applies each command when it
 * lands. A member's pause steps only that phone out, until Back in sync puts
 * it back where the class is.
 *
 * It steers the playback core (screens/usePlaybackCore) through `PlaybackHost`:
 * the core's clock, position and live-timer refs, and the moves it already
 * makes (tick, cues, finish). Each control below returns true when it took the
 * tap because this phone is in a class, so the solo control doesn't run.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, Platform } from 'react-native';
import { PhaseStep } from '../types';
import { type PlaybackState, positionAt, elapsedSeconds } from '../utils/playback';
import { type WorkoutClock, runningAt, pauseClock } from '../utils/workoutClock';
import { phasesFrom } from '../utils/liveTimerPhases';
import { t } from '../i18n';
import {
  startLiveTimer,
  updateLiveTimer,
  endLiveTimer,
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
} from './timeline';
import { ClassRelay, PULSE_MS } from './relay';
import { classCodeUrl } from './classCode';
import { type ClassSession, saveClassSession, clearClassSession } from './session';

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

/** What class mode needs from the playback core (screens/usePlaybackCore). */
export interface PlaybackHost {
  stepsRef: RefObject<PhaseStep[]>;
  clockRef: RefObject<WorkoutClock>;
  stateRef: RefObject<PlaybackState>;
  sessionIdRef: RefObject<string>;
  timerNameRef: RefObject<string>;
  /** Show a position: the ref the wakes read, and the render state. */
  setPosition: (next: PlaybackState) => void;
  setIsRunning: (running: boolean) => void;
  /** Play the second(s) the clock has crossed, and wake for the next. */
  tick: () => void;
  stopTicking: () => void;
  finishWorkout: (next: PlaybackState, from: PlaybackState) => void;
  /** A step's start cue; `halfwayGone` marks its halfway cue as already past. */
  announceStep: (idx: number, halfwayGone: boolean) => void;
  /** Wall-clock time step `idx` began on the workout clock. */
  stepStartWallMs: (idx: number) => number;
}

/** Taps on the instructor's controls closer together than this are one tap. */
const HOST_TAP_DEBOUNCE_MS = 500;
/** How long a mid-class joiner waits to hear the class before running on schedule. */
const JOIN_HOLD_MS = 5000;

export function useClassDriver(source: ClassSession | null, host: PlaybackHost) {
  const { stepsRef, clockRef, stateRef } = host;
  // `gathering` holds until the class's first second, so the start (or a late
  // join) is announced; `jumps` counts the instructor's jumps applied, so a
  // new one is announced too.
  const classRef = useRef<ClassSession | null>(source);
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

  // The relay's heartbeat / watchdog, armed natively too (see the core's
  // scheduleTick).
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
      updateLiveTimer({ sessionId: host.sessionIdRef.current, phases, phaseStartMs, actions }).catch(() => {});
      return;
    }
    liveOnRef.current = true;
    startLiveTimer({
      sessionId: host.sessionIdRef.current,
      title: host.timerNameRef.current,
      phases,
      phaseStartMs,
      actions,
    }).catch(() => {});
  }

  function hideClassLiveTimer() {
    if (!liveOnRef.current) return;
    liveOnRef.current = false;
    endLiveTimer(host.sessionIdRef.current).catch(() => {});
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
    host.setIsRunning(cc.running);
    host.stopTicking();

    if (target.mode === 'complete') {
      host.finishWorkout(target, prev);
      return;
    }
    if (jumped) {
      const step = steps[target.stepIndex];
      host.announceStep(
        target.stepIndex,
        target.timeRemaining < step.duration && target.timeRemaining <= Math.floor(step.duration / 2),
      );
      devClassLog('jump', target.stepIndex);
      host.setPosition(target);
    } else if (!cc.running || elapsedSeconds(steps, prev) > elapsedSeconds(steps, target)) {
      // Paused: show exactly where the class stopped (no tick will move us
      // there). Running but ahead: a pause reached this phone late, so step
      // back to the class quietly.
      host.setPosition(target);
    }

    const idx = stateRef.current.stepIndex;
    if (cc.running && (!wasRunning || jumped)) {
      showClassLiveTimer(phasesFrom(steps, idx), host.stepStartWallMs(idx), classActions(true));
    } else if (!cc.running && (wasRunning || jumped || !liveOnRef.current)) {
      showClassLiveTimer(
        [{ id: 'paused', label: t('classMode.pausedLive'), durationSeconds: 6 * 3600, countsUp: true }],
        Date.now(),
        classActions(false),
      );
    }
    if (cc.running !== wasRunning) devClassLog(cc.running ? 'run' : 'pause', stateRef.current.stepIndex);
    if (cc.running) host.tick();
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
    host.stopTicking();
    host.setIsRunning(false);
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

  // --- What useWorkoutPlayback calls: its controls, lifecycle and wakes ------

  /** Back in front: bring this phone to where the class is. */
  function sync(): boolean {
    if (!classRef.current) return false;
    applyClass();
    return true;
  }

  function togglePause(): boolean {
    const cs = classRef.current;
    if (!cs) return false;
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
    return true;
  }

  function back(restartThresholdSeconds: number): boolean {
    const cs = classRef.current;
    if (!cs) return false;
    if (cs.role === 'host' && classNow() >= cs.timeline.startAt && hostTap()) {
      const tl = classBack(stepsRef.current, cs.timeline, classNow(), restartThresholdSeconds);
      if (tl !== cs.timeline) commitTimeline(tl, true);
    }
    return true;
  }

  function skip(): boolean {
    const cs = classRef.current;
    if (!cs) return false;
    if (cs.role === 'host' && classNow() >= cs.timeline.startAt && hostTap()) {
      const tl = classSkip(stepsRef.current, cs.timeline, classNow());
      if (tl !== cs.timeline) commitTimeline(tl, true);
    }
    return true;
  }

  // The instructor ends the timed block for the whole class. A member's
  // Finish isn't taken here: it finishes their own phone, as solo.
  function finish(): boolean {
    if (classRef.current?.role !== 'host') return false;
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
    return true;
  }

  // The workout reached its end on this phone. The class is over for it:
  // nothing left to rejoin, and nothing left to say on the relay ("online
  // only while you're in a class").
  function finished() {
    liveOnRef.current = false;
    if (classRef.current) {
      clearClassSession();
      closeRelay();
    }
  }

  // Unmount: stop the class's wakes and leave the relay.
  function close() {
    if (classWakeRef.current) clearTimeout(classWakeRef.current);
    if (relayPulseRef.current) clearTimeout(relayPulseRef.current);
    cancelWake('class');
    cancelWake('relay');
    relayRef.current?.close();
    relayRef.current = null;
  }

  // A native wake (Android, app not in front) standing in for a class timer.
  function wake(id: string) {
    if (id === 'class' && classWakeRef.current) {
      clearTimeout(classWakeRef.current);
      classWakeRef.current = null;
      applyClass();
    } else if (id === 'relay' && relayPulseRef.current) {
      clearTimeout(relayPulseRef.current);
      relayPulse();
    }
  }

  return {
    /** The class this phone is in, or null for a solo workout. */
    session: () => classRef.current,
    start: startClass,
    sync,
    togglePause,
    back,
    skip,
    finish,
    finished,
    /** Leaving the class: nothing left to rejoin. */
    leave: clearClassSession,
    close,
    wake,
    devLog: devClassLog,
    view: classView,
    /** The class code to draw right now; redraw it often. */
    code: () => (classRef.current ? classCodeUrl(classRef.current.invite, classNow(), Date.now()) : null),
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
