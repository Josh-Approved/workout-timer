import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, WorkoutPhase } from '../types';
import { formatTime, formatDurationSpoken, FOR_TIME_OPEN_SECONDS } from '../utils/workout';
import {
  backTargetIndex,
  elapsedSeconds as pbElapsedSeconds,
  totalRemaining as pbTotalRemaining,
  progressFraction as pbProgressFraction,
} from '../utils/playback';
import { getTotalSets } from '../audio/workoutCues';
import {
  useWorkoutPlayback,
  phaseLabel,
  RESTART_THRESHOLD_SECONDS,
} from './useWorkoutPlayback';
import { WorkoutControls } from '../components/WorkoutControls';
import { WorkoutProgressBar } from '../components/WorkoutProgressBar';
import { WorkoutInfoPanels } from '../components/WorkoutInfoPanels';
import { RoundCounter } from '../components/RoundCounter';
import { WorkoutComplete } from '../components/WorkoutComplete';
import { ClassBar } from '../components/ClassBar';
import { ClassCodeSheet } from '../components/ClassCodeSheet';
import { useFeedback } from '../feedback/FeedbackProvider';
import { onSuccessMoment } from '../storage/reviewPrompt';
import { t } from '../i18n';

import {
  useTheme,
  fontFamily,
  space,
  type as ts,
  tracking,
  Colors,
} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

export default function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { c } = useTheme();
  const feedback = useFeedback();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    displayState,
    isRunning,
    loaded,
    steps,
    totalDuration,
    maxCycles,
    togglePause,
    handleBack,
    handleSkip,
    handleStop,
    handleFinish,
    restart,
    kind,
    openEnded,
    rounds,
    countRound,
    undoRound,
    finalElapsed,
    classView,
    classCode,
  } = useWorkoutPlayback(route.params, () => navigation.goBack());

  // Class mode (beta): the instructor's phone opens with the code up, so the
  // room can scan in while the start counts down.
  const params = route.params;
  const classWorkoutName = 'classSession' in params ? params.classSession.workout.name : '';
  const [codeVisible, setCodeVisible] = useState('classSession' in params && params.showCode === true);
  const inClass = classView != null;
  const isMember = classView?.role === 'member';
  const gathering = classView?.startsIn != null;
  // The play button shows what is about to happen once a pending class command lands.
  const shownRunning =
    classView?.pending?.action === 'pause' ? false : classView?.pending?.action === 'resume' ? true : isRunning;
  const holding = gathering || classView?.connecting === true;

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const currentStep = steps[displayState.stepIndex] ?? null;
  const phase: WorkoutPhase =
    displayState.mode === 'complete' ? 'complete' : currentStep?.phase ?? 'exercise';
  const isComplete = displayState.mode === 'complete';
  // A finished workout is this app's success moment (canon § Review prompt):
  // when an eligible session's review ask is being held, the shell presents it
  // here — after the completion cue, never at launch. Fires once per completion
  // (the mode only flips to 'complete' once); the call is a no-op otherwise.
  useEffect(() => {
    if (isComplete) onSuccessMoment();
  }, [isComplete]);
  // A named interval (custom sequence) is shown by its own name.
  const phaseText =
    !isComplete && currentStep?.label ? currentStep.label : phaseLabel(phase);
  const isSequence = kind === 'sequence';
  const withRounds = kind === 'amrap' || kind === 'for_time';
  const countUp = !isComplete && currentStep?.countUp === true;
  const isLastStep = displayState.stepIndex >= steps.length - 1;

  const totalSetsInCycle = currentStep != null ? getTotalSets(steps, currentStep) : 0;

  const setDisplay = currentStep?.setNumber != null
    ? `${currentStep.setNumber} / ${totalSetsInCycle}`
    : '—';
  const setA11yLabel = currentStep?.setNumber != null
    ? t(isSequence ? 'workout.intervalA11y' : 'workout.setA11y', { current: currentStep.setNumber, total: totalSetsInCycle })
    : t('workout.setA11yNone');

  const cycleDisplay = maxCycles > 0
    ? `${currentStep?.cycleNumber ?? '—'} / ${maxCycles}`
    : '1 / 1';
  const cycleA11yLabel = maxCycles > 1 && currentStep?.cycleNumber != null
    ? t(isSequence ? 'workout.roundA11y' : 'workout.cycleA11y', { current: currentStep.cycleNumber, total: maxCycles })
    : isSequence
      ? t('workout.roundA11y', { current: 1, total: 1 })
      : t('workout.cycleA11yDefault');

  // Count-up (For Time): the big number is time elapsed in the block.
  const stepElapsed = currentStep ? currentStep.duration - displayState.timeRemaining : 0;
  const bigTime = gathering ? classView!.startsIn! : countUp ? stepElapsed : displayState.timeRemaining;
  const timerA11yLabel = isComplete
    ? t('workout.complete')
    : gathering
      ? t('classMode.startsInA11y', { time: formatDurationSpoken(classView!.startsIn!) })
      : countUp
      ? t('workout.elapsedA11y', { time: formatDurationSpoken(stepElapsed) })
      : t('workout.remainingA11y', { time: formatDurationSpoken(displayState.timeRemaining) });

  const elapsedSeconds = pbElapsedSeconds(steps, displayState);
  const progressFraction = pbProgressFraction(totalDuration, elapsedSeconds);

  const totalRemaining = pbTotalRemaining(totalDuration, elapsedSeconds);
  const totalA11yLabel = t('workout.totalRemainingA11y', { time: formatDurationSpoken(totalRemaining) });
  // For Time with a cap shows the cap under the clock; without one, "No cap".
  const capSeconds = kind === 'for_time' && currentStep?.countUp ? currentStep.duration : 0;
  const capText = openEnded
    ? t('workout.noCap')
    : capSeconds > 0 && capSeconds < FOR_TIME_OPEN_SECONDS
      ? `${t('workout.timeCap')} · ${formatTime(capSeconds)}`
      : '';
  const capA11y = openEnded
    ? t('workout.noCapA11y')
    : t('workout.timeCapA11y', { time: formatDurationSpoken(capSeconds) });
  // The final readout for a count-up workout: the time it was finished at.
  const finalTime = isComplete && kind === 'for_time' && finalElapsed != null ? finalElapsed : null;
  // The clock is one merged accessibility element, so the cap line and the
  // final time are folded into its spoken label rather than lost beneath it.
  const clockA11yLabel = [
    timerA11yLabel,
    !isComplete && kind === 'for_time' && capText ? capA11y : null,
    finalTime != null ? t('workout.yourTimeA11y', { time: formatDurationSpoken(finalTime) }) : null,
  ]
    .filter(Boolean)
    .join('. ');

  // Label tracks what the back control will actually do right now, so VoiceOver
  // announces "Previous interval" only while it would step back.
  const backWillGoToPrevious =
    displayState.mode !== 'complete' &&
    currentStep != null &&
    backTargetIndex(displayState, currentStep.duration, RESTART_THRESHOLD_SECONDS) < displayState.stepIndex;
  const backA11yLabel = backWillGoToPrevious ? t('workout.previousInterval') : t('workout.restartInterval');

  const s = makeStyles(c, isLandscape);

  const timerDisplay = isComplete ? (
    <View style={s.timerContainer}>
      <WorkoutComplete
        isLandscape={isLandscape}
        a11yLabel={clockA11yLabel}
        finalTime={finalTime}
        onRestart={inClass ? undefined : restart}
      />
    </View>
  ) : (
    <View
      style={s.timerContainer}
      accessible
      accessibilityLabel={clockA11yLabel}
      accessibilityRole="text"
      accessibilityLiveRegion="none"
    >
      {gathering ? (
        <Text style={s.capText} importantForAccessibility="no">{t('classMode.classStartsIn')}</Text>
      ) : null}
      <Text
        style={s.timer}
        importantForAccessibility="no"
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        {formatTime(bigTime)}
      </Text>
      {kind === 'for_time' && capText ? (
        <Text style={s.capText} importantForAccessibility="no">{capText}</Text>
      ) : null}
    </View>
  );

  // The readout under the clock: set/cycle panels for interval timers and
  // sequences, the tap-to-count round counter for AMRAP / For Time.
  const readout = (layout: 'portrait' | 'landscape') =>
    withRounds ? (
      <RoundCounter
        rounds={rounds}
        isLandscape={layout === 'landscape'}
        complete={isComplete}
        onCount={countRound}
        onUndo={undoRound}
      />
    ) : (
      <WorkoutInfoPanels
        layout={layout}
        setLabel={isSequence ? t('workout.interval') : undefined}
        cycleLabel={isSequence ? t('workout.round') : undefined}
        setDisplay={setDisplay}
        setA11yLabel={setA11yLabel}
        cycleDisplay={cycleDisplay}
        cycleA11yLabel={cycleA11yLabel}
        totalDisplay={formatTime(totalRemaining)}
        totalA11yLabel={totalA11yLabel}
      />
    );

  const controls = (
    <WorkoutControls
      complete={displayState.mode === 'complete'}
      isRunning={shownRunning}
      isLandscape={isLandscape}
      backA11yLabel={backA11yLabel}
      onBack={handleBack}
      onStop={handleStop}
      onTogglePause={togglePause}
      onSkip={withRounds && isLastStep ? handleFinish : handleSkip}
      onDone={() => navigation.goBack()}
      skipFinishes={withRounds && isLastStep}
      showSeek={!isMember}
      playA11yLabel={classView?.steppedOut ? t('classMode.backInSync') : undefined}
      playDisabled={holding || (isMember && !isRunning && !classView?.steppedOut)}
      seekDisabled={holding}
    />
  );

  const classBar = classView && !isComplete ? (
    <ClassBar view={classView} onShowCode={() => setCodeVisible(true)} onFeedback={() => feedback.open('bug')} />
  ) : null;
  const codeSheet = inClass ? (
    <ClassCodeSheet
      visible={codeVisible}
      code={classCode}
      workoutName={classWorkoutName}
      startsIn={classView?.startsIn ?? null}
      onDismiss={() => setCodeVisible(false)}
    />
  ) : null;

  // An uncapped For Time has no whole to make progress against.
  const progressBar = openEnded ? (
    <View style={s.progressSpacer} />
  ) : (
    <WorkoutProgressBar
      steps={steps}
      displayState={displayState}
      progressFraction={progressFraction}
      isLandscape={isLandscape}
    />
  );

  if (!loaded) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.loading}>{t('workout.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (isLandscape) {
    return (
      <SafeAreaView style={s.container}>
        {classBar}
        <View style={s.landscapeTopRow}>
          <View style={s.leftCol}>
            <View
              style={s.phaseRow}
              accessible
              accessibilityLabel={phaseText}
              accessibilityRole="text"
            >
              <Text style={s.phaseLabel} importantForAccessibility="no" numberOfLines={2}>
                {phaseText}
              </Text>
            </View>
            {timerDisplay}
          </View>

          <View style={s.rightCol}>
            {readout('landscape')}
            {controls}
          </View>
        </View>

        {progressBar}
        {codeSheet}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {classBar}
      <View
        style={s.phaseRow}
        accessible
        accessibilityLabel={phaseText}
        accessibilityRole="text"
      >
        <Text style={s.phaseLabel} importantForAccessibility="no" numberOfLines={2}>
          {phaseText}
        </Text>
      </View>

      {timerDisplay}

      {readout('portrait')}

      {progressBar}

      {controls}
      {codeSheet}
    </SafeAreaView>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
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

    phaseRow: { alignItems: 'center', paddingTop: isLandscape ? space.s4 : space.s5 },
    phaseLabel: {
      fontSize: isLandscape ? 22 : 26,
      lineHeight: isLandscape ? 28 : 32,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      letterSpacing: tracking.tight,
      textAlign: 'center',
      paddingHorizontal: space.s6,
    },
    capText: {
      ...ts.sm,
      fontFamily: fontFamily.mono,
      color: c.fgMuted,
      fontVariant: ['tabular-nums'],
      marginTop: space.s2,
    },
    progressSpacer: {
      alignSelf: 'stretch',
      height: 14,
      marginBottom: isLandscape ? space.s4 : space.s6,
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
  });
}
