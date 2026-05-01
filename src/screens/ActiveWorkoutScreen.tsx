import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
  SafeAreaView,
  useWindowDimensions,
  AccessibilityInfo,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import * as ScreenOrientation from 'expo-screen-orientation';
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
  exercise: '#F97316',
  rest: '#3B82F6',
  recovery: '#10B981',
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

  const stateRef = useRef<DisplayState>({ mode: 'phase', stepIndex: 0, timeRemaining: 0 });
  const [displayState, setDisplayState] = useState<DisplayState>(stateRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ── Orientation ───────────────────────────────────────────────────────────

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

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
      return;
    }

    const nextStep = steps[nextIdx];
    firePhaseStart(nextStep, sounds, steps, maxCyclesRef.current, speechModeRef.current);
    halfwayFiredRef.current = false;
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
    halfwayFiredRef.current = false;
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
    halfwayFiredRef.current = false;
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

  const timerA11yLabel = displayState.mode === 'complete'
    ? 'Workout complete'
    : `${formatDurationSpoken(displayState.timeRemaining)} remaining`;

  // Progress through the entire workout (0–1)
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

  const s = makeStyles(isDark, phaseColor, isLandscape);

  // ── Shared elements ───────────────────────────────────────────────────────

  const timerDisplay = (
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
  );

  const progressBar = (
    <View
      style={s.progressOuter}
      accessible={true}
      accessibilityLabel={`Workout progress, ${Math.round(progressFraction * 100)} percent`}
      accessibilityRole="progressbar"
    >
      {/* Colored segments — one per PhaseStep */}
      <View style={s.progressTrack}>
        {stepsRef.current.map((step, idx) => (
          <View
            key={idx}
            style={{ flex: step.duration, height: '100%', backgroundColor: PHASE_COLORS[step.phase] }}
          />
        ))}
        {/* Consumed overlay slides in from the left */}
        <View
          style={[
            s.progressConsumed,
            { width: `${progressFraction * 100}%` as any },
          ]}
        />
      </View>
      {/* Scrubber thumb */}
      <View
        style={[
          s.progressThumb,
          { left: `${progressFraction * 100}%` as any },
        ]}
      />
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────

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
        {/* Two-column content area */}
        <View style={s.landscapeTopRow}>
          {/* Left: phase label + mega timer */}
          <View style={s.leftCol}>
            <View
              style={s.phaseRow}
              accessible={true}
              accessibilityLabel={PHASE_LABELS[phase]}
              accessibilityRole="text"
            >
              <Text style={s.phaseLabel} importantForAccessibility="no">{PHASE_LABELS[phase]}</Text>
            </View>
            {timerDisplay}
          </View>

          {/* Right: info stack + controls */}
          <View style={s.rightCol}>
            <View style={s.infoStack} accessible={false}>
              <View
                style={s.infoStackRow}
                accessible={true}
                accessibilityLabel={setA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">SET</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
              </View>
              <View
                style={[s.infoStackRow, s.infoStackRowBorder]}
                accessible={true}
                accessibilityLabel={cycleA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">CYCLE</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
              </View>
              <View
                style={[s.infoStackRow, s.infoStackRowBorder]}
                accessible={true}
                accessibilityLabel={totalA11yLabel}
                accessibilityRole="text"
              >
                <Text style={s.infoLabel} importantForAccessibility="no">TOTAL</Text>
                <Text style={s.infoValue} importantForAccessibility="no">{formatTime(totalRemaining)}</Text>
              </View>
            </View>
            {controls}
          </View>
        </View>

        {/* Full-width progress bar across both columns */}
        {progressBar}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View
        style={s.phaseRow}
        accessible={true}
        accessibilityLabel={PHASE_LABELS[phase]}
        accessibilityRole="text"
      >
        <Text style={s.phaseLabel} importantForAccessibility="no">{PHASE_LABELS[phase]}</Text>
      </View>

      {timerDisplay}

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
          <Text style={s.infoValue} importantForAccessibility="no">{formatTime(totalRemaining)}</Text>
        </View>
      </View>

      {progressBar}

      {controls}
    </SafeAreaView>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

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
    // Single utterance: phase name + context (avoids double-speak and session drop)
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

// ── Styles ────────────────────────────────────────────────────────────────

function makeStyles(isDark: boolean, phaseColor: string, isLandscape: boolean) {
  const bg = isDark ? '#0A0A0A' : '#FAFAFA';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#AAAAAA' : '#666666';
  const panelBg = isDark ? '#1A1A1A' : '#F0F0F0';
  const panelBorder = isDark ? '#2A2A2A' : '#DDDDDD';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: bg,
      flexDirection: 'column',
      alignItems: isLandscape ? 'stretch' : 'center',
      justifyContent: isLandscape ? 'flex-start' : 'space-between',
      paddingVertical: isLandscape ? 0 : 24,
    },
    loading: { flex: 1, fontSize: 18, color: text, textAlign: 'center', marginTop: 100 },

    // ── Portrait ────────────────────────────────────────────────────────────
    phaseRow: { alignItems: 'center', paddingTop: isLandscape ? 12 : 16 },
    phaseLabel: {
      fontSize: isLandscape ? 22 : 28,
      fontWeight: '800',
      color: phaseColor,
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    timerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      width: isLandscape ? '100%' : undefined,
    },
    timer: {
      fontSize: isLandscape ? 144 : 96,
      fontWeight: '200',
      color: text,
      fontVariant: ['tabular-nums'],
      letterSpacing: -2,
    },
    completeText: { fontSize: isLandscape ? 56 : 48, fontWeight: '700', color: '#22C55E' },
    infoRow: {
      flexDirection: 'row',
      backgroundColor: panelBg,
      borderRadius: 16,
      marginHorizontal: 24,
      marginBottom: 12,
      overflow: 'hidden',
    },
    infoPanel: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    infoPanelBorder: {
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: panelBorder,
    },
    infoLabel: {
      fontSize: isLandscape ? 11 : 10,
      fontWeight: '700',
      color: sub,
      letterSpacing: 1,
      marginBottom: isLandscape ? 0 : 4,
    },
    infoValue: {
      fontSize: isLandscape ? 20 : 17,
      fontWeight: '600',
      color: text,
      fontVariant: ['tabular-nums'],
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingBottom: isLandscape ? 0 : 8,
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

    // ── Progress bar ─────────────────────────────────────────────────────────
    progressOuter: {
      alignSelf: 'stretch',
      marginHorizontal: isLandscape ? 16 : 20,
      marginBottom: isLandscape ? 10 : 10,
      height: 32,
      justifyContent: 'center',
    },
    progressTrack: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 7,
      height: 18,
      borderRadius: 9,
      flexDirection: 'row',
      overflow: 'hidden',
      backgroundColor: isDark ? '#2A2A2A' : '#E0E0E0',
    },
    progressConsumed: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    progressThumb: {
      position: 'absolute',
      top: 1,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: '#FFFFFF',
      transform: [{ translateX: -15 }],
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 6,
      borderWidth: 1.5,
      borderColor: 'rgba(0,0,0,0.12)',
    },

    // ── Landscape ───────────────────────────────────────────────────────────
    landscapeTopRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    leftCol: {
      flex: 3,
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingVertical: 12,
      paddingLeft: 8,
    },
    rightCol: {
      flex: 2,
      alignItems: 'center',
      justifyContent: 'space-evenly',
      paddingVertical: 12,
      paddingRight: 8,
    },
    infoStack: {
      width: '100%',
      backgroundColor: panelBg,
      borderRadius: 16,
      overflow: 'hidden',
    },
    infoStackRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 11,
    },
    infoStackRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: panelBorder,
    },
  });
}
