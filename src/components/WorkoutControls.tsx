/**
 * Transport controls for the active workout: back / stop / play-pause / skip
 * while running, a single "Back to timers" button once complete. Extracted
 * from ActiveWorkoutScreen — the screen decides where the row sits (portrait
 * bottom vs. landscape right column); the behavior lives in the handlers it
 * passes down.
 */

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react-native';
import { t } from '../i18n';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ts,
  Colors,
} from '../theme';

type Props = {
  /** The workout is finished — show only the "Back to timers" affordance. */
  complete: boolean;
  isRunning: boolean;
  isLandscape: boolean;
  /** Tracks what the back control will do right now (restart vs. previous). */
  backA11yLabel: string;
  onBack: () => void;
  onStop: () => void;
  onTogglePause: () => void;
  onSkip: () => void;
  onDone: () => void;
};

export function WorkoutControls({
  complete,
  isRunning,
  isLandscape,
  backA11yLabel,
  onBack,
  onStop,
  onTogglePause,
  onSkip,
  onDone,
}: Props) {
  const { c } = useTheme();
  const s = makeStyles(c, isLandscape);

  if (complete) {
    return (
      <View style={s.controls}>
        <Pressable
          style={({ pressed }) => [s.doneBtn, pressed && s.pressed]}
          onPress={onDone}
          accessibilityLabel={t('workout.backToTimers')}
          accessibilityRole="button"
        >
          <Text style={s.doneBtnText} importantForAccessibility="no">{t('workout.backToTimers')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.controls}>
      <Pressable
        style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
        onPress={onBack}
        hitSlop={8}
        accessibilityLabel={backA11yLabel}
        accessibilityRole="button"
      >
        <SkipBack size={24} color={c.fg} strokeWidth={1.5} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
        onPress={onStop}
        hitSlop={8}
        accessibilityLabel={t('workout.stopWorkout')}
        accessibilityRole="button"
      >
        <Square size={22} color={c.danger} strokeWidth={1.75} fill={c.danger} />
      </Pressable>
      <Pressable
        style={({ pressed }) => [s.playPauseBtn, pressed && s.pressed]}
        onPress={onTogglePause}
        accessibilityLabel={isRunning ? t('workout.pause') : t('workout.resume')}
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
        onPress={onSkip}
        hitSlop={8}
        accessibilityLabel={t('workout.skip')}
        accessibilityRole="button"
      >
        <SkipForward size={24} color={c.fg} strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  return StyleSheet.create({
    pressed: { opacity: 0.7 },
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
  });
}
