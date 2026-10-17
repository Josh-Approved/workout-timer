/**
 * The round counter for AMRAP and For Time: a readout (ROUNDS + the count)
 * above two controls that look like the buttons they are — an ink primary
 * "Count a round" (the one action those modes need between glances at the
 * clock, kept tall for sweaty, eyes-off taps) and a ghost "Remove" for a
 * mis-tap. Both carry screen-reader labels; the count is baked into the
 * primary button's label (not `accessibilityValue`, which Android does not
 * refresh after mount) and is also announced by the playback hook on change.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
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
  rounds: number;
  isLandscape: boolean;
  /** Finished: the readout stands alone, with no controls. */
  complete: boolean;
  onCount: () => void;
  onUndo: () => void;
};

export function RoundCounter({ rounds, isLandscape, complete, onCount, onUndo }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c, isLandscape);
  const roundsA11y = t('workout.roundsA11y', { count: rounds });

  const readout = (
    <View
      style={[s.card, complete && s.cardDone]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={roundsA11y}
    >
      <Text style={s.label} importantForAccessibility="no">{t('workout.rounds')}</Text>
      <Text style={s.count} importantForAccessibility="no">{rounds}</Text>
    </View>
  );

  if (complete) return readout;

  return (
    <View style={s.block} accessible={false}>
      {readout}
      <View style={s.row} accessible={false}>
        <Pressable
          style={({ pressed }) => [s.countBtn, pressed && s.countBtnPressed]}
          onPress={onCount}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${t('workout.countRound')}. ${roundsA11y}`}
          accessibilityHint={t('workout.countRoundHint')}
        >
          <Plus size={22} color={c.inkButtonText} strokeWidth={2} />
          <Text style={s.countBtnText} importantForAccessibility="no" numberOfLines={1}>
            {t('workout.countRound')}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.undoBtn, rounds === 0 && s.undoBtnDisabled, pressed && s.pressed]}
          onPress={onUndo}
          disabled={rounds === 0}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('workout.undoRound')}
          accessibilityHint={t('workout.undoRoundHint')}
          accessibilityState={{ disabled: rounds === 0 }}
        >
          <Minus size={20} color={c.fg} strokeWidth={1.75} />
          <Text style={s.undoBtnText} importantForAccessibility="no" numberOfLines={1}>
            {t('workout.undoShort')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    block: {
      alignSelf: 'stretch',
      gap: space.s3,
      marginHorizontal: isLandscape ? 0 : space.s6,
      marginBottom: isLandscape ? 0 : space.s6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: space.s3,
    },
    card: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: isLandscape ? space.s3 : space.s4,
      paddingHorizontal: space.s5,
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      alignSelf: 'stretch',
    },
    // The finished readout stands alone: keep the screen margins it would
    // otherwise get from the block.
    cardDone: {
      marginHorizontal: isLandscape ? 0 : space.s6,
      marginBottom: isLandscape ? 0 : space.s6,
    },
    label: {
      ...ts.xs,
      fontFamily: fontFamily.sansMedium,
      color: c.fgMuted,
      letterSpacing: tracking.wide,
      textTransform: 'uppercase',
      marginBottom: space.s1,
    },
    count: {
      fontSize: isLandscape ? 36 : 44,
      lineHeight: isLandscape ? 42 : 52,
      fontFamily: fontFamily.mono,
      color: c.fg,
      fontVariant: ['tabular-nums'],
    },
    // Ink primary: the one action these modes need mid-workout.
    countBtn: {
      flex: 2,
      minHeight: Math.round(target.min * 1.5),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s2,
      paddingHorizontal: space.s4,
      borderRadius: radius.pill,
      backgroundColor: c.inkButton,
    },
    countBtnPressed: { opacity: 0.8 },
    countBtnText: {
      ...ts.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.inkButtonText,
    },
    // Ghost secondary, matching the transport row's bordered controls.
    undoBtn: {
      flex: 1,
      minHeight: Math.round(target.min * 1.5),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s2,
      paddingHorizontal: space.s3,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bgElevated,
    },
    undoBtnDisabled: { opacity: 0.4 },
    undoBtnText: {
      ...ts.sm,
      fontFamily: fontFamily.sansMedium,
      color: c.fg,
    },
  });
}
