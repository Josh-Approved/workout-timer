/**
 * The small "Beta" label on everything class mode shows: a plain flag that
 * this feature works but hasn't been proven everywhere yet.
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { t } from '../i18n';
import { useTheme, fontFamily, space, radius, type as ty, Colors } from '../theme';

export function BetaChip() {
  const { c } = useTheme();
  const s = makeStyles(c);
  return <Text style={s.chip}>{t('classMode.beta')}</Text>;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    chip: {
      ...ty.xs,
      fontFamily: fontFamily.sansSemibold,
      color: c.warning,
      backgroundColor: c.warningBg,
      paddingHorizontal: space.s3,
      paddingVertical: space.s1,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
  });
}
