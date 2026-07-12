/**
 * Canonical, app-agnostic — synced by `sync.mjs drilldown`; do not fork.
 *
 * One configurable dimension on a hub screen: label left, current value +
 * chevron right. The row never holds the options themselves — tapping opens
 * that dimension's focused editor (a DrilldownSheet). The value text is the
 * receipt: always the current state, muted while it's still the default ask.
 */

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import {
  useTheme,
  fontFamily,
  space,
  target,
  type as ty,
  hairline,
  type Colors,
} from '../theme';

type Props = {
  label: string;
  value: string;
  /** Render the value muted — it's a prompt ("Not set"), not a choice yet. */
  placeholder?: boolean;
  onPress: () => void;
};

export function DrilldownRow({ label, value, placeholder, onPress }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
    >
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, placeholder && s.valueMuted]} numberOfLines={1}>
        {value}
      </Text>
      <ChevronRight size={18} color={c.fgSubtle} strokeWidth={1.5} />
    </Pressable>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      minHeight: target.min + 6,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
    label: { ...ty.base, fontFamily: fontFamily.sans, color: c.fg },
    value: {
      ...ty.base,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      flex: 1,
      textAlign: 'right',
    },
    valueMuted: { color: c.fgSubtle },
  });
}
