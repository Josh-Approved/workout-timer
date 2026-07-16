/**
 * The set / cycle / total-remaining readout for the active workout. One
 * component, two arrangements: side-by-side panels across the portrait screen,
 * a stacked label/value card in the landscape right column. Extracted from
 * ActiveWorkoutScreen — the values (and their spoken a11y labels) are derived
 * by the screen and passed in preformatted.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { t } from '../i18n';
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

type Props = {
  layout: 'portrait' | 'landscape';
  setDisplay: string;
  setA11yLabel: string;
  cycleDisplay: string;
  cycleA11yLabel: string;
  totalDisplay: string;
  totalA11yLabel: string;
};

export function WorkoutInfoPanels({
  layout,
  setDisplay,
  setA11yLabel,
  cycleDisplay,
  cycleA11yLabel,
  totalDisplay,
  totalA11yLabel,
}: Props) {
  const { c } = useTheme();
  const isLandscape = layout === 'landscape';
  const s = makeStyles(c, isLandscape);

  if (isLandscape) {
    return (
      <View style={s.infoStack} accessible={false}>
        <View
          style={s.infoStackRow}
          accessible
          accessibilityLabel={setA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.set')}</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
        </View>
        <View
          style={[s.infoStackRow, s.infoStackRowBorder]}
          accessible
          accessibilityLabel={cycleA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.cycle')}</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
        </View>
        <View
          style={[s.infoStackRow, s.infoStackRowBorder]}
          accessible
          accessibilityLabel={totalA11yLabel}
          accessibilityRole="text"
        >
          <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.total')}</Text>
          <Text style={s.infoValue} importantForAccessibility="no">{totalDisplay}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.infoRow} accessible={false}>
      <View
        style={s.infoPanel}
        accessible
        accessibilityLabel={setA11yLabel}
        accessibilityRole="text"
      >
        <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.set')}</Text>
        <Text style={s.infoValue} importantForAccessibility="no">{setDisplay}</Text>
      </View>
      <View
        style={[s.infoPanel, s.infoPanelBorder]}
        accessible
        accessibilityLabel={cycleA11yLabel}
        accessibilityRole="text"
      >
        <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.cycle')}</Text>
        <Text style={s.infoValue} importantForAccessibility="no">{cycleDisplay}</Text>
      </View>
      <View
        style={[s.infoPanel, s.infoPanelBorder]}
        accessible
        accessibilityLabel={totalA11yLabel}
        accessibilityRole="text"
      >
        <Text style={s.infoLabel} importantForAccessibility="no">{t('workout.total')}</Text>
        <Text style={s.infoValue} importantForAccessibility="no">{totalDisplay}</Text>
      </View>
    </View>
  );
}

function makeStyles(c: Colors, isLandscape: boolean) {
  return StyleSheet.create({
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
