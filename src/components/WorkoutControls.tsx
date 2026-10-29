/**
 * Transport controls for the active workout: back / stop / play-pause / skip
 * while running, a single "Back to timers" button once complete. Extracted
 * from ActiveWorkoutScreen — the screen decides where the row sits (portrait
 * bottom vs. landscape right column); the behavior lives in the handlers it
 * passes down.
 */

import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Flag, Pause, Play, SkipBack, SkipForward, Square } from 'lucide-react-native';
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
  /** The skip control ends the workout (last step of an AMRAP / For Time):
   *  it reads and looks like "Finish" rather than "Skip". */
  skipFinishes?: boolean;
  /** Class members follow the instructor: no back / skip of their own. */
  showSeek?: boolean;
  /** Overrides the play/pause label (a stepped-out class member: "Back in sync"). */
  playA11yLabel?: string;
  /** Class mode: play/pause can't act right now (the class is gathering, or the instructor paused it). */
  playDisabled?: boolean;
  /** Class mode: back/skip can't act right now (the class hasn't started). */
  seekDisabled?: boolean;
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
  skipFinishes = false,
  showSeek = true,
  playA11yLabel,
  playDisabled = false,
  seekDisabled = false,
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
      {showSeek ? (
        <Pressable
          style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed, seekDisabled && s.disabled]}
          onPress={onBack}
          disabled={seekDisabled}
          hitSlop={8}
          accessibilityLabel={backA11yLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: seekDisabled }}
        >
          <SkipBack size={24} color={c.fg} strokeWidth={1.5} />
        </Pressable>
      ) : null}
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
        style={({ pressed }) => [s.playPauseBtn, pressed && s.pressed, playDisabled && s.disabled]}
        onPress={onTogglePause}
        disabled={playDisabled}
        accessibilityState={{ disabled: playDisabled }}
        accessibilityLabel={playA11yLabel ?? (isRunning ? t('workout.pause') : t('workout.resume'))}
        accessibilityRole="button"
      >
        {isRunning ? (
          <Pause size={36} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
        ) : (
          <Play size={36} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
        )}
      </Pressable>
      {!showSeek && !skipFinishes ? null : skipFinishes ? (
        <Pressable
          style={({ pressed }) => [s.finishBtn, pressed && s.pressed]}
          onPress={onSkip}
          hitSlop={8}
          accessibilityLabel={t('workout.finish')}
          accessibilityRole="button"
        >
          <Flag size={20} color={c.fg} strokeWidth={1.75} />
          <Text style={s.finishBtnText} importantForAccessibility="no" numberOfLines={1}>
            {t('workout.finishShort')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed, seekDisabled && s.disabled]}
          onPress={onSkip}
          disabled={seekDisabled}
          hitSlop={8}
          accessibilityLabel={t('workout.skip')}
          accessibilityRole="button"
          accessibilityState={{ disabled: seekDisabled }}
        >
          <SkipForward size={24} color={c.fg} strokeWidth={1.5} />
        </Pressable>
      )}
    </View>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  return StyleSheet.create({
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.35 },
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
    // The "Finish" control for AMRAP / For Time: same ghost treatment as the
    // other transport buttons, but labelled — ending a timed effort is not a
    // control to leave to an icon.
    finishBtn: {
      height: 60,
      paddingHorizontal: space.s5,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bgElevated,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s2,
    },
    finishBtnText: {
      ...ts.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
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
