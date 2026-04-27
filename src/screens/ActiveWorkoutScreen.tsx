import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
  SafeAreaView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, PhaseStep, SoundSettings, WorkoutPhase } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import { buildWorkoutSequence, formatTime, formatDurationSpoken, getTotalDuration, buildPhaseAnnouncement } from '../utils/workout';
import { AudioEngine } from '../audio/AudioEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

type Mode = 'phase' | 'complete';

interface DisplayState {
  mode: Mode;
  stepIndex: number;
  timeRemaining: number;
}

const PHASE_COLORS: Record<WorkoutPhase, string> = {
  initial_countdown: '#6B7280',
  warm_up: '#F59E0B',
  exercise: '#EF4444',
  rest: '#3B82F6',
  recovery: '#8B5CF6',
  cool_down: '#06B6D4',
  complete: '#22C55E',
};

const PHASE_LABELS: Record<WorkoutPhase, string> = {
  initial_countdown: 'GET READY',
  warm_up: 'WARM UP',
  exercise: 'EXERCISE',
  rest: 'REST',
  recovery: 'RECOVERY',
  cool_down: 'COOL DOWN',
  complete: 'COMPLETE',
};

export default function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { timerId } = route.params;
  const isDark = useColorScheme() === 'dark';

  const stepsRef = useRef<PhaseStep[]>([]);
  const soundsRef = useRef<SoundSettings | null>(null);
  const totalDurationRef = useRef(0);
  const maxCyclesRef = useRef(0);
  const speechModeRef = useRef(false);
  const isRunningRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef<DisplayState>({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  const [displayState, setDisplayState] = useState<DisplayState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [timers, settings] = await Promise.all([loadTimers(), loadSettings()]);
      if (cancelled) return;

      const timer = timers.find((t) => t.id === timerId);
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

      if (steps.length === 0) return;

      // Fire the start sound for the first phase, then begin
      const maxCycles = getMaxCycles(steps);
      firePhaseStart(steps[0], settings.sounds, steps, maxCycles, settings.audioAccessibilityMode);
      const initial: DisplayState = { mode: 'phase', stepIndex: 0, timeRemaining: steps[0].duration };
      stateRef.current = initial;
      setDisplayState(initial);
      setLoaded(true);

      await activateKeepAwakeAsync();
    })();

    return () => {
      cancelled = true;
      deactivateKeepAwake();
    };
  }, [timerId]);

  // ── Tick ──────────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const s = stateRef.current;
    const sounds = soundsRef.current!;
    const steps = stepsRef.current;
    const newTime = s.timeRemaining - 1;

    if (newTime > 0) {
      // Audio-only end-of-interval warning
      if (sounds.countdownDuration > 0 && newTime <= sounds.countdownDuration) {
        AudioEngine.playTick().catch(() => {});
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const next = { ...s, timeRemaining: newTime };
      stateRef.current = next;
      setDisplayState(next);
      return;
    }

    // Interval ended — advance instantly
    const nextIdx = s.stepIndex + 1;
    if (nextIdx >= steps.length) {
      playComplete(sounds, speechModeRef.current);
      const next: DisplayState = { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 };
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      return;
    }

    const nextStep = steps[nextIdx];
    firePhaseStart(nextStep, sounds, steps, maxCyclesRef.current, speechModeRef.current);
    const next: DisplayState = { mode: 'phase', stepIndex: nextIdx, timeRemaining: nextStep.duration };
    stateRef.current = next;
    setDisplayState(next);
  }, []);

  // ── Interval management ───────────────────────────────────────────────────

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

  // ── Controls ──────────────────────────────────────────────────────────────

  const togglePause = () => {
    if (displayState.mode === 'complete') return;
    if (isRunningRef.current) {
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
    } else {
      isRunningRef.current = true;
      setIsRunning(true);
      startInterval();
    }
  };

  const handleRestart = () => {
    if (displayState.mode === 'complete') return;
    const s = stateRef.current;
    const currentStep = stepsRef.current[s.stepIndex];
    firePhaseStart(currentStep, soundsRef.current!, stepsRef.current, maxCyclesRef.current, speechModeRef.current);
    const next: DisplayState = { mode: 'phase', stepIndex: s.stepIndex, timeRemaining: currentStep.duration };
    stateRef.current = next;
    setDisplayState(next);
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
      return;
    }

    const nextStep = steps[nextIdx];
    firePhaseStart(nextStep, sounds, steps, maxCyclesRef.current, speechModeRef.current);
    const next: DisplayState = { mode: 'phase', stepIndex: nextIdx, timeRemaining: nextStep.duration };
    stateRef.current = next;
    setDisplayState(next);
  };

  const handleStop = () => {
    Alert.alert('Stop Workout', 'End this workout?', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => { stopInterval(); navigation.goBack(); },
      },
    ]);
  };

  // ── Derived display ───────────────────────────────────────────────────────

  const currentStep = stepsRef.current[displayState.stepIndex] ?? null;
  const phase: WorkoutPhase =
    displayState.mode === 'complete' ? 'complete' : currentStep?.phase ?? 'exercise';
  const phaseColor = PHASE_COLORS[phase];

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

  const totalA11yLabel = `Total time, ${formatDurationSpoken(totalDurationRef.current)}`;

  const timerA11yLabel = displayState.mode === 'complete'
    ? 'Workout complete'
    : `${formatDurationSpoken(displayState.timeRemaining)} remaining`;

  const s = makeStyles(isDark, phaseColor);

  if (!loaded) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.loading}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Phase label */}
      <View
        style={s.phaseRow}
        accessible={true}
        accessibilityLabel={PHASE_LABELS[phase]}
        accessibilityRole="text"
      >
        <Text style={s.phaseLabel} importantForAccessibility="no">{PHASE_LABELS[phase]}</Text>
      </View>

      {/* Big timer */}
      <View
        style={s.timerContainer}
        accessible={true}
        accessibilityLabel={timerA11yLabel}
        accessibilityRole="text"
        accessibilityLiveRegion="none"
      >
        {displayState.mode === 'complete' ? (
          <Text style={s.completeText} importantForAccessibility="no">Done! 🎉</Text>
        ) : (
          <Text style={s.timer} importantForAccessibility="no">{formatTime(displayState.timeRemaining)}</Text>
        )}
      </View>

      {/* Info panels: Set · Cycle · Total */}
      <View style={s.infoRow} accessible={false}>
        <View
          style={s.infoPanel}
          accessible={true}
          accessibilityLabel={setA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">SET</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
        </View>
        <View
          style={[s.infoPanel, s.infoPanelBorder]}
          accessible={true}
          accessibilityLabel={cycleA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">CYCLE</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
        </View>
        <View
          style={[s.infoPanel, s.infoPanelBorder]}
          accessible={true}
          accessibilityLabel={totalA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">TOTAL</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{formatTime(totalDurationRef.current)}</Text>
        </View>
      </View>

      {/* Controls */}
      {displayState.mode !== 'complete' ? (
        <View style={s.controls}>
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={handleRestart}
            hitSlop={8}
            accessibilityLabel="Restart current interval"
            accessibilityRole="button"
          >
            <Text style={s.secondaryBtnText} importantForAccessibility="no">⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.stopBtn}
            onPress={handleStop}
            hitSlop={8}
            accessibilityLabel="Stop workout"
            accessibilityRole="button"
          >
            <Text style={s.stopBtnText} importantForAccessibility="no">■</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.playPauseBtn, { backgroundColor: phaseColor }]}
            onPress={togglePause}
            accessibilityLabel={isRunning ? 'Pause' : 'Resume'}
            accessibilityRole="button"
          >
            <Text style={s.playPauseBtnText} importantForAccessibility="no">{isRunning ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={handleSkip}
            hitSlop={8}
            accessibilityLabel="Skip to next interval"
            accessibilityRole="button"
          >
            <Text style={s.secondaryBtnText} importantForAccessibility="no">⏭</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.controls}>
          <TouchableOpacity
            style={s.doneBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Back to timers"
            accessibilityRole="button"
          >
            <Text style={s.doneBtnText} importantForAccessibility="no">Back to Timers</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

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
  if (key) AudioEngine.playSound(sounds[key] as any).catch(() => {});
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  if (speechMode) {
    const totalSetsInCycle =
      step.phase === 'exercise' || step.phase === 'rest'
        ? getTotalSets(allSteps, step)
        : 0;
    Speech.speak(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles), { language: 'en-US' });
  }
}

function playComplete(sounds: SoundSettings, speechMode: boolean): void {
  AudioEngine.playSound(sounds.workoutComplete).catch(() => {});
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  if (speechMode) {
    Speech.speak('Workout complete', { language: 'en-US' });
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

// ── Styles ────────────────────────────────────────────────────────────────

function makeStyles(isDark: boolean, phaseColor: string) {
  const bg = isDark ? '#0A0A0A' : '#FAFAFA';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#AAAAAA' : '#666666';
  const panelBg = isDark ? '#1A1A1A' : '#F0F0F0';
  const panelBorder = isDark ? '#2A2A2A' : '#DDDDDD';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 24,
    },
    loading: { flex: 1, fontSize: 18, color: text, textAlign: 'center', marginTop: 100 },
    phaseRow: { alignItems: 'center', paddingTop: 16 },
    phaseLabel: {
      fontSize: 28,
      fontWeight: '800',
      color: phaseColor,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    timerContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    timer: {
      fontSize: 96,
      fontWeight: '200',
      color: text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
    },
    completeText: { fontSize: 48, fontWeight: '700', color: '#22C55E' },
    infoRow: {
      flexDirection: 'row',
      backgroundColor: panelBg,
      borderRadius: 16,
      marginHorizontal: 24,
      marginBottom: 20,
      overflow: 'hidden',
    },
    infoPanel: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    infoPanelBorder: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: panelBorder,
    },
    infoLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: sub,
      letterSpacing: 1,
      marginBottom: 4,
    },
    infoValue: {
      fontSize: 17,
      fontWeight: '600',
      color: text,
      fontVariant: ['tabular-nums'],
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingBottom: 8,
    },
    secondaryBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: isDark ? '#2C2C2E' : '#E5E7EB',
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryBtnText: { fontSize: 20 },
    stopBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: isDark ? '#2C2C2E' : '#E5E7EB',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stopBtnText: { fontSize: 18, color: '#EF4444' },
    playPauseBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: phaseColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 6,
    },
    playPauseBtnText: { fontSize: 28, color: '#FFFFFF' },
    doneBtn: {
      backgroundColor: '#22C55E',
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 30,
    },
    doneBtnText: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  });
}
