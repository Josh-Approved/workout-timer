/**
 * Sound-style spoke: pick the cue for one workout event from the full style
 * list, each on its own row — replaces the horizontally-scrolling pill strip
 * that clipped past the screen edge. Tapping a style selects it AND plays the
 * preview, and the sheet stays open so styles can be auditioned back to back
 * (a deliberate exception to the single-select-return-immediately rule:
 * sounds have to be heard to be chosen). Back is done.
 */

import React from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { ALL_SOUND_STYLES, SOUND_STYLE_LABELS, type SoundStyle } from '../types';
import { DrilldownSheet, SheetOption } from './DrilldownSheet';
import { t } from '../i18n';
import { useTheme, fontFamily, space, type as ty, boundedContent, type Colors } from '../theme';

type Props = {
  visible: boolean;
  /** The workout event being configured — the sheet title. */
  eventLabel: string;
  value: SoundStyle;
  onClose: () => void;
  onPick: (style: SoundStyle) => void;
};

export function SoundStyleSheet({ visible, eventLabel, value, onClose, onPick }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <DrilldownSheet visible={visible} title={eventLabel} onClose={onClose}>
      <ScrollView contentContainerStyle={s.list}>
        <Text style={s.hint}>{t('settings.soundsHint')}</Text>
        {ALL_SOUND_STYLES.map((style) => (
          <SheetOption
            key={style}
            label={SOUND_STYLE_LABELS[style]}
            selected={value === style}
            onPress={() => onPick(style)}
          />
        ))}
      </ScrollView>
    </DrilldownSheet>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    list: { ...boundedContent, paddingBottom: space.s9 },
    hint: {
      ...ty.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      paddingHorizontal: space.s6,
      paddingTop: space.s3,
      paddingBottom: space.s2,
    },
  });
}
