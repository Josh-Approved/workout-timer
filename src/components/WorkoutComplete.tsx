/**
 * The finished-workout readout: the Done check (plus the final time for a For
 * Time workout) and, under it, the button that runs the same workout again.
 * Extracted from ActiveWorkoutScreen, which decides where it sits.
 *
 * The readout and the button are siblings on purpose — a button nested inside
 * an `accessible` container is unreachable by VoiceOver / TalkBack, so only
 * the readout carries the merged label.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Check, RotateCcw } from 'lucide-react-native';
import { formatTime } from '../utils/workout';
import { t } from '../i18n';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  target,
  type as ts,
  tracking,
  Colors,
} from '../theme';

type Props = {
  isLandscape: boolean;
  /** The spoken readout (complete, plus the final time when there is one). */
  a11yLabel: string;
  /** Seconds a count-up workout was finished at; null for every other kind. */
  finalTime: number | null;
  onRestart: () => void;
};

export function WorkoutComplete({ isLandscape, a11yLabel, finalTime, onRestart }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c, isLandscape);

  return (
    <>
      <View style={s.readout} accessible accessibilityLabel={a11yLabel} accessibilityRole="text">
        <View style={s.doneRow} importantForAccessibility="no">
          <Check size={isLandscape ? 56 : 44} color={c.accent} strokeWidth={2} />
          <Text style={s.doneText}>{t('common.done')}</Text>
        </View>
        {finalTime != null ? (
          <Text style={s.finalTime} importantForAccessibility="no">
            {t('workout.yourTime')} · {formatTime(finalTime)}
          </Text>
        ) : null}
      </View>
      <Pressable
        style={({ pressed }) => [s.restartBtn, pressed && s.pressed]}
        onPress={onRestart}
        accessibilityRole="button"
        accessibilityLabel={t('workout.restartWorkout')}
        accessibilityHint={t('workout.restartWorkoutHint')}
      >
        <RotateCcw size={18} color={c.fg} strokeWidth={1.75} />
        <Text style={s.restartText} importantForAccessibility="no">{t('workout.restartWorkout')}</Text>
      </Pressable>
    </>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  return StyleSheet.create({
    readout: { alignItems: 'center' },
    doneRow: { flexDirection: 'row', alignItems: 'center', gap: space.s4 },
    doneText: {
      fontSize: isLandscape ? 56 : 48,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      letterSpacing: tracking.tight,
    },
    finalTime: {
      ...ts.sm,
      fontFamily: fontFamily.mono,
      color: c.fgMuted,
      fontVariant: ['tabular-nums'],
      marginTop: space.s2,
    },
    restartBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      minHeight: target.min,
      marginTop: space.s6,
      paddingHorizontal: space.s6,
      paddingVertical: space.s3,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bgElevated,
    },
    restartText: {
      ...ts.base,
      fontFamily: fontFamily.sansMedium,
      color: c.fg,
    },
    pressed: { opacity: 0.7 },
  });
}
