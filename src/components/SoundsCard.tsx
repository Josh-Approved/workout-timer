/**
 * The Settings "Sounds" card: the app's cue volume on top, then one summary
 * row per cue event (hub-and-spoke — the full style list lives in the
 * SoundStyleSheet, where every option fits full-width instead of a
 * horizontally-clipped pill strip). Extracted from SettingsScreen.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { SoundEventKey, SoundSettings, SOUND_STYLE_LABELS } from '../types';
import { previewCue } from '../audio/cuePreview';
import { t } from '../i18n';
import { DrilldownRow } from './DrilldownRow';
import { SliderField } from './SliderField';
import { useTheme, space, radius, hairline, Colors } from '../theme';

// Keys only — the visible label is resolved at render via t() so it stays
// translatable (canon § Translations: never resolve copy in a module constant).
const SOUND_EVENT_KEYS: SoundEventKey[] = [
  'warmUpStart',
  'workStart',
  'restStart',
  'recoveryStart',
  'coolDownStart',
  'workoutComplete',
  'halfwaySound',
];

// How long the volume slider rests before it plays a sample at the new level —
// long enough not to stutter through a drag, short enough to feel immediate.
const VOLUME_PREVIEW_DELAY_MS = 350;

type Props = {
  sounds: SoundSettings;
  /** Store + apply the new volume (0–100); the card plays the sample itself. */
  onVolumeChange: (value: number) => void;
  onOpenEvent: (key: SoundEventKey) => void;
};

export function SoundsCard({ sounds, onVolumeChange, onOpenEvent }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }, []);

  // The sample is the exercise cue (the one heard most), or a plain beep when
  // that cue is off.
  const changeVolume = (value: number) => {
    onVolumeChange(value);
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      previewCue('workStart', sounds.workStart === 'none' ? 'beep' : sounds.workStart);
    }, VOLUME_PREVIEW_DELAY_MS);
  };

  return (
    <View style={s.card}>
      {/* DrilldownRow brings no horizontal padding of its own (it's built for
          a padded hub scroll), so the card supplies the same gutter as every
          other settings row. */}
      <View style={s.inset}>
        <SliderField
          label={t('settings.volume')}
          hint={t('settings.volumeHint')}
          value={sounds.volume}
          onChange={changeVolume}
          min={0}
          max={100}
          step={5}
          unit="%"
          spokenValue={t('settings.volumeA11yValue', { percent: sounds.volume })}
          style={s.volumeRow}
          colors={c}
        />
        {SOUND_EVENT_KEYS.map((eventKey) => (
          <DrilldownRow
            key={eventKey}
            label={t(`settings.soundEvents.${eventKey}`)}
            value={SOUND_STYLE_LABELS[sounds[eventKey]]}
            onPress={() => onOpenEvent(eventKey)}
          />
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: space.s6,
      overflow: 'hidden',
    },
    inset: { paddingHorizontal: space.s5 },
    // First row of an already-inset card: no own gutter, no top divider (the
    // card edge is right there), and a divider below like the rows under it.
    volumeRow: {
      paddingHorizontal: 0,
      borderTopWidth: 0,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
  });
}
