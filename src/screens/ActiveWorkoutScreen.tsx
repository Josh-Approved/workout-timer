import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Check, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, PhaseStep, SoundSettings, WorkoutPhase } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import {
  buildWorkoutSequence,
  formatTime,
  formatDurationSpoken,
  getTotalDuration,
  buildPhaseAnnouncement,
} from '../utils/workout';
import { AudioEngine } from '../audio/AudioEngine';
import { recordSuccessfulCompletion } from '../storage/reviewPrompt';
import ReviewModal from '../components/ReviewModal';
import {
  startLiveTimer,
  updateLiveTimer,
  endLiveTimer,
  useLiveTimerEvents,
  type LiveTimerPhase,
} from 'live-timer';

const APP_STORE_ID = '6767314178';
const ANDROID_PACKAGE_NAME = 'com.joshapproved.freeworkouttimer';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ts,
  hairline,
  tracking,
  Colors,
} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

type Mode = 'phase' | 'complete';

interface DisplayState {
  mode: Mode;
  stepIndex: number;
  timeRemaining: number;
}

const PHASE_LABELS: Record<WorkoutPhase, string> = {
  initial_countdown: 'Get ready',
  warm_up: 'Warm up',
  exercise: 'Exercise',
  rest: 'Rest',
  recovery: 'Recovery',
  cool_down: 'Cool down',
  complete: 'Complete',
};

export default function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { timerId } = route.params;
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

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
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [timers, settings] = await Promise.all([loadTimers(), loadSettings()]);
      if (cancelled) return;

      const timer = timers.find((tt) => tt.id === timerId);
      if (!timer) {
        Alert.alert('Error', 'Timer not found.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      const steps = buildWorkoutSequence(timer);
      stepsRef.current = steps;
      soundsRef.current = settings.sounds;
      totalDurationRef.current = getTotalDuration(timer);
      maxCyclesRef.current = getMaxCycles(steps);
      speechModeRef.current = settings.audioAccessibilityMode;
      timerNameRef.current = timer.name || 'Workout';

      if (steps.length === 0) return;

      const maxCycles = getMaxCycles(steps);
      firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      const initial: DisplayState = { mode: 'phase', stepIndex: 0, timeRemaining: steps[0].duration };
      stateRef.current = initial;
      setDisplayState(initial);
      setLoaded(true);

      await activateKeepAwakeAsync();

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
      endLiveTimer(sessionIdRef.current).catch(() => {});
    };
  }, [timerId]);

  const tick = useCallback(() => {
    const s = stateRef.current;
    const sounds = soundsRef.current!;
    const steps = stepsRef.current;
    const newTime = s.timeRemaining - 1;

    if (newTime > 0) {
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
      const next = { ...s, timeRemaining: newTime };
      stateRef.current = next;
      setDisplayState(next);
      return;
    }

    const nextIdx = s.stepIndex + 1;
    if (nextIdx >= steps.length) {
      playComplete(sounds, speechModeRef.current);
      const next: DisplayState = { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 };
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
      return;
    }

    const nextStep = steps[nextIdx];
    firePhaseStart(nextStep, sounds, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    const next: DisplayState = { mode: 'phase', stepIndex: nextIdx, timeRemaining: nextStep.duration };
    stateRef.current = next;
    setDisplayState(next);
    updateLiveTimer({
      sessionId: sessionIdRef.current,
      phases: phasesFrom(steps, nextIdx),
      phaseStartMs: Date.now(),
    }).catch(() => {});
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

  useEffect(() => {
    if (displayState.mode !== 'complete') return;
    recordSuccessfulCompletion().then((shouldPrompt) => {
      if (shouldPrompt) setShowReview(true);
    });
  }, [displayState.mode]);

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

  const handleRestart = () => {
    if (displayState.mode === 'complete') return;
    const s = stateRef.current;
    const currentStep = stepsRef.current[s.stepIndex];
    firePhaseStart(currentStep, soundsRef.current!, stepsRef.current, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    const next: DisplayState = { mode: 'phase', stepIndex: s.stepIndex, timeRemaining: currentStep.duration };
    stateRef.current = next;
    setDisplayState(next);
    updateLiveTimer({
      sessionId: sessionIdRef.current,
      phases: phasesFrom(stepsRef.current, s.stepIndex),
      phaseStartMs: Date.now(),
    }).catch(() => {});
  };

  const handleSkip = () => {
    if (displayState.mode === 'complete') return;
    const s = stateRef.current;
    const steps = stepsRef.current;
    const sounds = soundsRef.current!;
    const nextIdx = s.stepIndex + 1;

    if (nextIdx >= steps.length) {
      playComplete(sounds, speechModeRef.current);
      const next: DisplayState = { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 };
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      endLiveTimer(sessionIdRef.current).catch(() => {});
      return;
    }

    const nextStep = steps[nextIdx];
    firePhaseStart(nextStep, sounds, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
    const next: DisplayState = { mode: 'phase', stepIndex: nextIdx, timeRemaining: nextStep.duration };
    stateRef.current = next;
    setDisplayState(next);
    updateLiveTimer({
      sessionId: sessionIdRef.current,
      phases: phasesFrom(steps, nextIdx),
      phaseStartMs: Date.now(),
    }).catch(() => {});
  };

  const handleStop = () => {
    Alert.alert('Stop workout', 'End this workout?', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          stopInterval();
          endLiveTimer(sessionIdRef.current).catch(() => {});
          navigation.goBack();
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

  const currentStep = stepsRef.current[displayState.stepIndex] ?? null;
  const phase: WorkoutPhase =
    displayState.mode === 'complete' ? 'complete' : currentStep?.phase ?? 'exercise';

  const totalSetsInCycle = currentStep != null ? getTotalSets(stepsRef.current, currentStep) : 0;

  const setDisplay = currentStep?.setNumber != null
    ? `${currentStep.setNumber} / ${totalSetsInCycle}`
    : '—';
  const setA11yLabel = currentStep?.setNumber != null
    ? `Set, ${currentStep.setNumber} of ${totalSetsInCycle}`
    : 'Set, not applicable';

  const maxCycles = maxCyclesRef.current;
  const cycleDisplay = maxCycles > 0
    ? `${currentStep?.cycleNumber ?? '—'} / ${maxCycles}`
    : '1 / 1';
  const cycleA11yLabel = maxCycles > 1 && currentStep?.cycleNumber != null
    ? `Cycle, ${currentStep.cycleNumber} of ${maxCycles}`
    : 'Cycle, 1 of 1';

  const timerA11yLabel = displayState.mode === 'complete'
    ? 'Workout complete'
    : `${formatDurationSpoken(displayState.timeRemaining)} remaining`;

  const elapsedSeconds = stepsRef.current
    .slice(0, displayState.stepIndex)
    .reduce((sum, step) => sum + step.duration, 0)
    + (displayState.mode === 'complete'
        ? (currentStep?.duration ?? 0)
        : (currentStep ? currentStep.duration - displayState.timeRemaining : 0));
  const progressFraction = totalDurationRef.current > 0
    ? Math.min(1, elapsedSeconds / totalDurationRef.current)
    : 0;

  const totalRemaining = Math.max(0, totalDurationRef.current - elapsedSeconds);
  const totalA11yLabel = `Total remaining, ${formatDurationSpoken(totalRemaining)}`;

  const s = makeStyles(c, isLandscape);

  const timerDisplay = (
    <View
      style={s.timerContainer}
      accessible
      accessibilityLabel={timerA11yLabel}
      accessibilityRole="text"
      accessibilityLiveRegion="none"
    >
      {displayState.mode === 'complete' ? (
        <View style={s.completeRow} importantForAccessibility="no">
          <Check size={isLandscape ? 56 : 44} color={c.accent} strokeWidth={2} />
          <Text style={s.completeText}>Done</Text>
        </View>
      ) : (
        <Text
          style={s.timer}
          importantForAccessibility="no"
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {formatTime(displayState.timeRemaining)}
        </Text>
      )}
    </View>
  );

  const controls = displayState.mode !== 'complete' ? (
    <View style={s.controls}>
      <Pressable
        style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
        onPress={handleRestart}
        hitSlop={8}
        accessibilityLabel="Restart current interval"
        accessibilityRole="button"
      >
        <SkipBack size={24} color={c.fg} strokeWidth={1.5} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
        onPress={handleStop}
        hitSlop={8}
        accessibilityLabel="Stop workout"
        accessibilityRole="button"
      >
        <Square size={22} color={c.danger} strokeWidth={1.75} fill={c.danger} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.playPauseBtn, pressed && s.pressed]}
        onPress={togglePause}
        accessibilityLabel={isRunning ? 'Pause' : 'Resume'}
        accessibilityRole="button"
      >
        {isRunning ? (
          <Pause size={36} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
        ) : (
          <Play size={36} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
        )}
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
        onPress={handleSkip}
        hitSlop={8}
        accessibilityLabel="Skip to next interval"
        accessibilityRole="button"
      >
        <SkipForward size={24} color={c.fg} strokeWidth={1.5} />
      </Pressable>
    </View>
  ) : (
    <View style={s.controls}>
      <Pressable
        style={({ pressed }) => [s.doneBtn, pressed && s.pressed]}
        onPress={() => navigation.goBack()}
        accessibilityLabel="Back to timers"
        accessibilityRole="button"
      >
        <Text style={s.doneBtnText} importantForAccessibility="no">Back to timers</Text>
      </Pressable>
    </View>
  );

  const progressBar = (
    <View
      style={s.progressOuter}
      accessible
      accessibilityLabel={`Workout progress, ${Math.round(progressFraction * 100)} percent`}
      accessibilityRole="progressbar"
    >
      <View style={s.segmentRow} importantForAccessibility="no">
        {stepsRef.current.map((step, i) => {
          let segFill = 0;
          if (displayState.mode === 'complete' || i < displayState.stepIndex) segFill = 1;
          else if (i === displayState.stepIndex && step.duration > 0) {
            segFill = (step.duration - displayState.timeRemaining) / step.duration;
          }
          const isWork = step.phase === 'exercise';
          return (
            <View
              key={i}
              style={[
                s.segment,
                { flex: Math.max(1, step.duration), backgroundColor: isWork ? c.hairlineStrong : c.hairline },
              ]}
              importantForAccessibility="no"
            >
              <View style={[s.segmentFill, { width: `${segFill * 100}%` as any }]} />
            </View>
          );
        })}
      </View>
    </View>
  );

  if (!loaded) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (isLandscape) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.landscapeTopRow}>
          <View style={s.leftCol}>
            <View
              style={s.phaseRow}
              accessible
              accessibilityLabel={PHASE_LABELS[phase]}
              accessibilityRole="text"
            >
              <Text style={s.phaseLabel} importantForAccessibility="no">
                {PHASE_LABELS[phase]}
              </Text>
            </View>
            {timerDisplay}
          </View>

          <View style={s.rightCol}>
            <View style={s.infoStack} accessible={false}>
              <View
                style={s.infoStackRow}
                accessible
                accessibilityLabel={setA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">Set</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
              </View>
              <View
                style={[s.infoStackRow, s.infoStackRowBorder]}
                accessible
                accessibilityLabel={cycleA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">Cycle</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
              </View>
              <View
                style={[s.infoStackRow, s.infoStackRowBorder]}
                accessible
                accessibilityLabel={totalA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">Total</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{formatTime(totalRemaining)}</Text>
              </View>
            </View>
            {controls}
          </View>
        </View>

        {progressBar}
        <ReviewModal
          visible={showReview}
          onDismiss={() => setShowReview(false)}
          appName="Free workout timer"
          iosAppStoreId={APP_STORE_ID}
          androidPackageName={ANDROID_PACKAGE_NAME}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View
        style={s.phaseRow}
        accessible
        accessibilityLabel={PHASE_LABELS[phase]}
        accessibilityRole="text"
      >
        <Text style={s.phaseLabel} importantForAccessibility="no">
          {PHASE_LABELS[phase]}
        </Text>
      </View>

      {timerDisplay}

      <View style={s.infoRow} accessible={false}>
        <View
          style={s.infoPanel}
          accessible
          accessibilityLabel={setA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">Set</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
        </View>
        <View
          style={[s.infoPanel, s.infoPanelBorder]}
          accessible
          accessibilityLabel={cycleA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">Cycle</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
        </View>
        <View
          style={[s.infoPanel, s.infoPanelBorder]}
          accessible
          accessibilityLabel={totalA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">Total</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{formatTime(totalRemaining)}</Text>
        </View>
      </View>

      {progressBar}

      {controls}
      <ReviewModal
        visible={showReview}
        onDismiss={() => setShowReview(false)}
        appName="Free workout timer"
        iosAppStoreId={APP_STORE_ID}
        androidPackageName={ANDROID_PACKAGE_NAME}
      />
    </SafeAreaView>
  );
}

const VOICE_PHASE_PHRASES: Partial<Record<WorkoutPhase, string>> = {
  initial_countdown: 'Get Ready',
  warm_up: 'Warm Up',
  exercise: 'Exercise',
  rest: 'Rest',
  recovery: 'Recovery',
  cool_down: 'Cool Down',
};

function speakAndReactivate(phrase: string): void {
  Speech.stop();
  Speech.speak(phrase, {
    language: 'en-US',
    onDone: () => { AudioEngine.reactivate().catch(() => {}); },
    onError: () => { AudioEngine.reactivate().catch(() => {}); },
  });
}

function playSoundOrVoice(style: string, voicePhrase: string): void {
  if (style === 'voice') {
    if (voicePhrase) speakAndReactivate(voicePhrase);
  } else if (style !== 'none') {
    AudioEngine.playSound(style as any).catch(() => {});
  }
}

function firePhaseStart(
  step: PhaseStep,
  sounds: SoundSettings,
  allSteps: PhaseStep[],
  maxCycles: number,
  speechMode: boolean,
): void {
  const styleMap: Partial<Record<WorkoutPhase, keyof SoundSettings>> = {
    warm_up: 'warmUpStart',
    exercise: 'workStart',
    rest: 'restStart',
    recovery: 'recoveryStart',
    cool_down: 'coolDownStart',
    initial_countdown: 'warmUpStart',
  };
  const key = styleMap[step.phase];
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

  if (!key) return;

  const style = sounds[key] as string;
  const totalSetsInCycle =
    step.phase === 'exercise' || step.phase === 'rest' ? getTotalSets(allSteps, step) : 0;

  if (style === 'voice' && speechMode) {
    speakAndReactivate(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles));
  } else {
    playSoundOrVoice(style, VOICE_PHASE_PHRASES[step.phase] ?? '');
    if (speechMode) {
      speakAndReactivate(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles));
    }
  }
}

function playComplete(sounds: SoundSettings, speechMode: boolean): void {
  const style = sounds.workoutComplete as string;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  AccessibilityInfo.announceForAccessibility('Workout complete');

  if (style === 'voice' && speechMode) {
    speakAndReactivate('Workout complete');
  } else {
    playSoundOrVoice(style, 'Workout Complete');
    if (speechMode) speakAndReactivate('Workout complete');
  }
}

function getTotalSets(steps: PhaseStep[], current: PhaseStep): number {
  if (current.cycleNumber == null) return 0;
  return steps.filter(
    (s) => s.phase === 'exercise' && s.cycleNumber === current.cycleNumber
  ).length;
}

function getMaxCycles(steps: PhaseStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.cycleNumber ?? 0), 0);
}

function phasesFrom(
  steps: PhaseStep[],
  idx: number,
  activeOverrideSeconds?: number,
): LiveTimerPhase[] {
  const out: LiveTimerPhase[] = [];
  if (steps[idx]) {
    out.push({
      id: `step-${idx}`,
      label: PHASE_LABELS[steps[idx].phase],
      durationSeconds: activeOverrideSeconds ?? steps[idx].duration,
    });
  }
  if (steps[idx + 1]) {
    out.push({
      id: `step-${idx + 1}`,
      label: PHASE_LABELS[steps[idx + 1].phase],
      durationSeconds: steps[idx + 1].duration,
    });
  }
  return out;
}

function makeStyles(c: Colors, isLandscape: boolean) {
  const PROGRESS_HEIGHT = 14;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.bg,
      flexDirection: 'column',
      alignItems: isLandscape ? 'stretch' : 'center',
      justifyContent: isLandscape ? 'flex-start' : 'space-between',
      paddingVertical: isLandscape ? 0 : space.s6,
    },
    loading: {
      flex: 1,
      ...ts.md,
      color: c.fg,
      fontFamily: fontFamily.sans,
      textAlign: 'center',
      marginTop: 100,
    },
    pressed: { opacity: 0.7 },

    phaseRow: { alignItems: 'center', paddingTop: isLandscape ? space.s4 : space.s5 },
    phaseLabel: {
      fontSize: isLandscape ? 22 : 26,
      lineHeight: isLandscape ? 28 : 32,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      letterSpacing: tracking.tight,
    },
    timerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      width: isLandscape ? '100%' : undefined,
    },
    timer: {
      fontSize: isLandscape ? 144 : 104,
      fontFamily: fontFamily.mono,
      color: c.fg,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
    },
    completeRow: { flexDirection: 'row', alignItems: 'center', gap: space.s4 },
    completeText: {
      fontSize: isLandscape ? 56 : 48,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      letterSpacing: tracking.tight,
    },

    infoRow: {
      flexDirection: 'row',
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginHorizontal: space.s6,
      marginBottom: space.s7,
      overflow: 'hidden',
      alignSelf: 'stretch',
    },
    infoPanel: { flex: 1, alignItems: 'center', paddingVertical: space.s5 },
    infoPanelBorder: { borderLeftWidth: hairline, borderLeftColor: c.hairline },
    infoLabel: {
      ...ts.xs,
      fontFamily: fontFamily.sansMedium,
      color: c.fgMuted,
      letterSpacing: tracking.wide,
      textTransform: 'uppercase',
      marginBottom: isLandscape ? 0 : space.s1,
    },
    infoValue: {
      ...ts.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      fontVariant: ['tabular-nums'],
    },

    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: space.s5,
      paddingTop: isLandscape ? 0 : space.s5,
      paddingBottom: isLandscape ? 0 : space.s4,
    },
    secondaryBtn: {
      width: 60,
      height: 60,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playPauseBtn: {
      width: 88,
      height: 88,
      borderRadius: radius.pill,
      backgroundColor: c.inkButton,
      justifyContent: 'center',
      alignItems: 'center',
    },
    doneBtn: {
      backgroundColor: c.inkButton,
      paddingHorizontal: space.s7,
      paddingVertical: space.s4,
      borderRadius: radius.pill,
    },
    doneBtnText: {
      ...ts.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.inkButtonText,
    },

    progressOuter: {
      alignSelf: 'stretch',
      marginHorizontal: space.s6,
      marginBottom: isLandscape ? space.s4 : space.s6,
      height: PROGRESS_HEIGHT,
      justifyContent: 'center',
    },
    segmentRow: {
      flexDirection: 'row',
      height: PROGRESS_HEIGHT,
      gap: 2,
    },
    segment: {
      height: PROGRESS_HEIGHT,
      borderRadius: 3,
      overflow: 'hidden',
    },
    segmentFill: {
      height: '100%',
      backgroundColor: c.fg,
    },

    landscapeTopRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    leftCol: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: space.s5,
      paddingLeft: space.s5,
      paddingRight: space.s4,
      gap: space.s4,
    },
    rightCol: {
      flex: 1,
      alignItems: 'stretch',
      justifyContent: 'center',
      paddingVertical: space.s5,
      paddingLeft: space.s4,
      paddingRight: space.s5,
      gap: space.s5,
    },
    infoStack: {
      width: '100%',
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      overflow: 'hidden',
    },
    infoStackRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
    },
    infoStackRowBorder: { borderTopWidth: hairline, borderTopColor: c.hairline },
  });
}
