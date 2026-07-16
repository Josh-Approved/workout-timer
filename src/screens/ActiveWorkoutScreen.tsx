import React, { useEffect } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Check } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, WorkoutPhase } from '../types';
import { formatTime, formatDurationSpoken } from '../utils/workout';
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
import { TIP_PRODUCT_IDS } from '../constants/tipProducts';
import ReviewModal from '../components/ReviewModal';
import TipJarSheet from '../components/TipJarSheet';
import { WorkoutControls } from '../components/WorkoutControls';
import { WorkoutProgressBar } from '../components/WorkoutProgressBar';
import { WorkoutInfoPanels } from '../components/WorkoutInfoPanels';
import { t } from '../i18n';

const APP_STORE_ID = '6767314178';
const ANDROID_PACKAGE_NAME = 'com.joshapproved.freeworkouttimer';
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
  const { timerId } = route.params;
  const { c } = useTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    displayState,
    isRunning,
    loaded,
    showReview,
    setShowReview,
    showTip,
    setShowTip,
    steps,
    totalDuration,
    maxCycles,
    togglePause,
    handleBack,
    handleSkip,
    handleStop,
  } = useWorkoutPlayback(timerId, () => navigation.goBack());

  useEffect(() => {
    ScreenOrientation.unlockAsync().catch(() => {});
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const currentStep = steps[displayState.stepIndex] ?? null;
  const phase: WorkoutPhase =
    displayState.mode === 'complete' ? 'complete' : currentStep?.phase ?? 'exercise';

  const totalSetsInCycle = currentStep != null ? getTotalSets(steps, currentStep) : 0;

  const setDisplay = currentStep?.setNumber != null
    ? `${currentStep.setNumber} / ${totalSetsInCycle}`
    : '—';
  const setA11yLabel = currentStep?.setNumber != null
    ? t('workout.setA11y', { current: currentStep.setNumber, total: totalSetsInCycle })
    : t('workout.setA11yNone');

  const cycleDisplay = maxCycles > 0
    ? `${currentStep?.cycleNumber ?? '—'} / ${maxCycles}`
    : '1 / 1';
  const cycleA11yLabel = maxCycles > 1 && currentStep?.cycleNumber != null
    ? t('workout.cycleA11y', { current: currentStep.cycleNumber, total: maxCycles })
    : t('workout.cycleA11yDefault');

  const timerA11yLabel = displayState.mode === 'complete'
    ? t('workout.complete')
    : t('workout.remainingA11y', { time: formatDurationSpoken(displayState.timeRemaining) });

  const elapsedSeconds = pbElapsedSeconds(steps, displayState);
  const progressFraction = pbProgressFraction(totalDuration, elapsedSeconds);

  const totalRemaining = pbTotalRemaining(totalDuration, elapsedSeconds);
  const totalA11yLabel = t('workout.totalRemainingA11y', { time: formatDurationSpoken(totalRemaining) });

  // Label tracks what the back control will actually do right now, so VoiceOver
  // announces "Previous interval" only while it would step back.
  const backWillGoToPrevious =
    displayState.mode !== 'complete' &&
    currentStep != null &&
    backTargetIndex(displayState, currentStep.duration, RESTART_THRESHOLD_SECONDS) < displayState.stepIndex;
  const backA11yLabel = backWillGoToPrevious ? t('workout.previousInterval') : t('workout.restartInterval');

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
          <Text style={s.completeText}>{t('common.done')}</Text>
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

  const controls = (
    <WorkoutControls
      complete={displayState.mode === 'complete'}
      isRunning={isRunning}
      isLandscape={isLandscape}
      backA11yLabel={backA11yLabel}
      onBack={handleBack}
      onStop={handleStop}
      onTogglePause={togglePause}
      onSkip={handleSkip}
      onDone={() => navigation.goBack()}
    />
  );

  const progressBar = (
    <WorkoutProgressBar
      steps={steps}
      displayState={displayState}
      progressFraction={progressFraction}
      isLandscape={isLandscape}
    />
  );

  const modals = (
    <>
      <ReviewModal
        visible={showReview}
        onDismiss={() => setShowReview(false)}
        appName="Workout Timer"
        iosAppStoreId={APP_STORE_ID}
        androidPackageName={ANDROID_PACKAGE_NAME}
      />
      {showTip && (
        <TipJarSheet
          visible
          onDismiss={() => setShowTip(false)}
          productIds={TIP_PRODUCT_IDS}
        />
      )}
    </>
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
        <View style={s.landscapeTopRow}>
          <View style={s.leftCol}>
            <View
              style={s.phaseRow}
              accessible
              accessibilityLabel={phaseLabel(phase)}
              accessibilityRole="text"
            >
              <Text style={s.phaseLabel} importantForAccessibility="no">
                {phaseLabel(phase)}
              </Text>
            </View>
            {timerDisplay}
          </View>

          <View style={s.rightCol}>
            <WorkoutInfoPanels
              layout="landscape"
              setDisplay={setDisplay}
              setA11yLabel={setA11yLabel}
              cycleDisplay={cycleDisplay}
              cycleA11yLabel={cycleA11yLabel}
              totalDisplay={formatTime(totalRemaining)}
              totalA11yLabel={totalA11yLabel}
            />
            {controls}
          </View>
        </View>

        {progressBar}
        {modals}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View
        style={s.phaseRow}
        accessible
        accessibilityLabel={phaseLabel(phase)}
        accessibilityRole="text"
      >
        <Text style={s.phaseLabel} importantForAccessibility="no">
          {phaseLabel(phase)}
        </Text>
      </View>

      {timerDisplay}

      <WorkoutInfoPanels
        layout="portrait"
        setDisplay={setDisplay}
        setA11yLabel={setA11yLabel}
        cycleDisplay={cycleDisplay}
        cycleA11yLabel={cycleA11yLabel}
        totalDisplay={formatTime(totalRemaining)}
        totalA11yLabel={totalA11yLabel}
      />

      {progressBar}

      {controls}
      {modals}
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
