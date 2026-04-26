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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, PhaseStep, SoundSettings, WorkoutPhase } from '../types';
import { loadTimers, loadSettings } from '../storage/storage';
import { buildWorkoutSequence, formatTime, getTotalDuration } from '../utils/workout';
import { AudioEngine } from '../audio/AudioEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

type Mode = 'pre_countdown' | 'phase' | 'complete';

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

// Phases that should NEVER get a pre-countdown — transition is instant
const NO_COUNTDOWN_PHASES: WorkoutPhase[] = ['rest'];

export default function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { timerId } = route.params;
  const isDark = useColorScheme() === 'dark';

  const stepsRef = useRef<PhaseStep[]>([]);
  const soundsRef = useRef<SoundSettings | null>(null);
  const totalDurationRef = useRef(0);
  const maxCyclesRef = useRef(0);
  const isRunningRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stateRef = useRef<DisplayState>({
    mode: 'pre_countdown',
    stepIndex: 0,
    timeRemaining: 0,
  });

  const [displayState, setDisplayState] = useState<DisplayState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Load timer and settings ───────────────────────────────────────────────

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

      const initial = makeInitialState(steps, settings.sounds.countdownDuration);
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

  // ── Step transition helper ────────────────────────────────────────────────

  const transitionToStep = useCallback(
    (nextIdx: number): DisplayState | null => {
      const sounds = soundsRef.current!;
      const steps = stepsRef.current;

      if (nextIdx >= steps.length) return null; // signal complete

      const nextStep = steps[nextIdx];
      const countdownDur = sounds.countdownDuration;
      const skipCountdown =
        countdownDur === 0 || NO_COUNTDOWN_PHASES.includes(nextStep.phase);

      if (skipCountdown) {
        firePhaseStart(nextStep.phase, sounds);
        return { mode: 'phase', stepIndex: nextIdx, timeRemaining: nextStep.duration };
      }

      // Start pre-countdown
      AudioEngine.playTick().catch(() => {});
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      return { mode: 'pre_countdown', stepIndex: nextIdx, timeRemaining: countdownDur };
    },
    []
  );

  // ── Tick logic ────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const s = stateRef.current;
    const sounds = soundsRef.current!;
    const steps = stepsRef.current;

    const newTime = s.timeRemaining - 1;

    if (newTime > 0) {
      if (s.mode === 'pre_countdown') {
        AudioEngine.playTick().catch(() => {});
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      const next = { ...s, timeRemaining: newTime };
      stateRef.current = next;
      setDisplayState(next);
      return;
    }

    // Time is up in pre_countdown → begin the actual phase
    if (s.mode === 'pre_countdown') {
      const step = steps[s.stepIndex];
      firePhaseStart(step.phase, sounds);
      const next: DisplayState = {
        mode: 'phase',
        stepIndex: s.stepIndex,
        timeRemaining: step.duration,
      };
      stateRef.current = next;
      setDisplayState(next);
      return;
    }

    // Phase ended → advance to next step
    const nextIdx = s.stepIndex + 1;
    if (nextIdx >= steps.length) {
      playComplete(sounds);
      const next: DisplayState = { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 };
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      return;
    }

    const next = transitionToStep(nextIdx)!;
    stateRef.current = next;
    setDisplayState(next);
  }, [transitionToStep]);

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
    if (loaded && stateRef.current.mode !== 'complete') {
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
    const steps = stepsRef.current;
    const sounds = soundsRef.current!;
    const currentStep = steps[s.stepIndex];

    // Restart the current interval from full duration
    firePhaseStart(currentStep.phase, sounds);
    const next: DisplayState = {
      mode: 'phase',
      stepIndex: s.stepIndex,
      timeRemaining: currentStep.duration,
    };
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
      playComplete(sounds);
      const next: DisplayState = { mode: 'complete', stepIndex: s.stepIndex, timeRemaining: 0 };
      stateRef.current = next;
      setDisplayState(next);
      stopInterval();
      isRunningRef.current = false;
      setIsRunning(false);
      return;
    }

    const next = transitionToStep(nextIdx)!;
    stateRef.current = next;
    setDisplayState(next);
  };

  const handleStop = () => {
    Alert.alert('Stop Workout', 'End this workout?', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => {
          stopInterval();
          navigation.goBack();
        },
      },
    ]);
  };

  // ── Derived display values ────────────────────────────────────────────────

  const currentStep = stepsRef.current[displayState.stepIndex] ?? null;
  const phase: WorkoutPhase =
    displayState.mode === 'complete' ? 'complete' : currentStep?.phase ?? 'exercise';
  const phaseColor = PHASE_COLORS[phase];
  const phaseLabel = PHASE_LABELS[phase];

  const setDisplay = currentStep?.setNumber != null
    ? `${currentStep.setNumber} / ${getTotalSets(stepsRef.current, currentStep)}`
    : '—';

  const cycleDisplay = maxCyclesRef.current > 0
    ? `${currentStep?.cycleNumber ?? '—'} / ${maxCyclesRef.current}`
    : '1 / 1';

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
      <View style={s.phaseRow}>
        {displayState.mode === 'pre_countdown' ? (
          <Text style={s.phaseCountdownLabel}>{phaseLabel} ›› STARTING</Text>
        ) : (
          <Text style={s.phaseLabel}>{phaseLabel}</Text>
        )}
      </View>

      {/* Big timer */}
      <View style={s.timerContainer}>
        {displayState.mode === 'pre_countdown' ? (
          <Text style={s.countdown}>{displayState.timeRemaining}</Text>
        ) : displayState.mode === 'complete' ? (
          <Text style={s.completeText}>Done! 🎉</Text>
        ) : (
          <Text style={s.timer}>{formatTime(displayState.timeRemaining)}</Text>
        )}
      </View>

      {/* Info panels: Set · Cycle · Total */}
      <View style={s.infoRow}>
        <View style={s.infoPanel}>
          <Text style={s.infoLabel}>SET</Text>
          <Text style={s.infoValue}>{setDisplay}</Text>
        </View>
        <View style={[s.infoPanel, s.infoPanelBorder]}>
          <Text style={s.infoLabel}>CYCLE</Text>
          <Text style={s.infoValue}>{cycleDisplay}</Text>
        </View>
        <View style={[s.infoPanel, s.infoPanelBorder]}>
          <Text style={s.infoLabel}>TOTAL</Text>
          <Text style={s.infoValue}>{formatTime(totalDurationRef.current)}</Text>
        </View>
      </View>

      {/* Controls */}
      {displayState.mode !== 'complete' ? (
        <View style={s.controls}>
          <TouchableOpacity style={s.secondaryBtn} onPress={handleRestart} hitSlop={8}>
            <Text style={s.secondaryBtnText}>⏮</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.stopBtn} onPress={handleStop} hitSlop={8}>
            <Text style={s.stopBtnText}>■</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.playPauseBtn, { backgroundColor: phaseColor }]}
            onPress={togglePause}
          >
            <Text style={s.playPauseBtnText}>{isRunning ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={handleSkip} hitSlop={8}>
            <Text style={s.secondaryBtnText}>⏭</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.controls}>
          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={s.doneBtnText}>Back to Timers</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function makeInitialState(steps: PhaseStep[], countdownDur: number): DisplayState {
  if (steps.length === 0) return { mode: 'complete', stepIndex: 0, timeRemaining: 0 };
  const firstPhase = steps[0].phase;
  const skipCountdown = countdownDur === 0 || NO_COUNTDOWN_PHASES.includes(firstPhase);
  if (skipCountdown) {
    return { mode: 'phase', stepIndex: 0, timeRemaining: steps[0].duration };
  }
  return { mode: 'pre_countdown', stepIndex: 0, timeRemaining: countdownDur };
}

function firePhaseStart(phase: WorkoutPhase, sounds: SoundSettings): void {
  const styleMap: Partial<Record<WorkoutPhase, keyof SoundSettings>> = {
    warm_up: 'warmUpStart',
    exercise: 'workStart',
    rest: 'restStart',
    recovery: 'recoveryStart',
    cool_down: 'coolDownStart',
    initial_countdown: 'warmUpStart',
  };
  const key = styleMap[phase];
  if (key) AudioEngine.playSound(sounds[key] as any).catch(() => {});
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
}

function playComplete(sounds: SoundSettings): void {
  AudioEngine.playSound(sounds.workoutComplete).catch(() => {});
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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

    // Phase label
    phaseRow: { alignItems: 'center', paddingTop: 16 },
    phaseLabel: {
      fontSize: 28,
      fontWeight: '800',
      color: phaseColor,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    phaseCountdownLabel: {
      fontSize: 18,
      fontWeight: '600',
      color: phaseColor,
      letterSpacing: 1,
      opacity: 0.85,
    },

    // Main timer
    timerContainer: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    timer: {
      fontSize: 96,
      fontWeight: '200',
      color: text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
    },
    countdown: {
      fontSize: 120,
      fontWeight: '300',
      color: phaseColor,
      fontVariant: ['tabular-nums'],
    },
    completeText: { fontSize: 48, fontWeight: '700', color: '#22C55E' },

    // Info panels
    infoRow: {
      flexDirection: 'row',
      backgroundColor: panelBg,
      borderRadius: 16,
      marginHorizontal: 24,
      marginBottom: 20,
      overflow: 'hidden',
    },
    infoPanel: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
    },
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

    // Controls
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
