/**
 * Canonical, app-agnostic — synced by `sync.mjs drilldown`; do not fork.
 *
 * The standard single-select control for SHORT option sets (roughly 2–7
 * short labels): a wrapping row of pill chips, selected = ink pill — the
 * same pill language as the interval-unit picker (UX guideline, Josh
 * 2026-07-18: single-select options read as chips, not as a check-list).
 * Use it inside DrilldownSheet spokes; a chips spoke applies immediately
 * on tap. LONG or rich lists (leading elements, detail lines, unbounded /
 * user-grown sets) use SheetOption rows instead.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  useTheme,
  fontFamily,
  space,
  target,
  type as ty,
  radius,
  type Colors,
} from '../theme';

export type ChipOption = { key: string; label: string };

type Props = {
  options: ChipOption[];
  selectedKey: string;
  onPick: (key: string) => void;
};

export function OptionChips({ options, selectedKey, onPick }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <View style={s.row}>
      {options.map((o) => {
        const selected = o.key === selectedKey;
        return (
          <Pressable
            key={o.key}
            onPress={() => onPick(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            style={({ pressed }) => [s.chip, selected && s.chipSelected, pressed && s.pressed]}
          >
            <Text style={[s.chipText, selected && s.chipTextSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 },
    chip: {
      minHeight: target.min,
      justifyContent: 'center',
      paddingHorizontal: space.s4,
      borderRadius: radius.pill,
      backgroundColor: c.bgSubtle,
    },
    chipSelected: { backgroundColor: c.inkButton },
    chipText: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fg },
    chipTextSelected: { color: c.inkButtonText, fontFamily: fontFamily.sansSemibold },
  });
}
