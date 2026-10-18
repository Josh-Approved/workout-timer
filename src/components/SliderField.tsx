import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import ValueEditorModal from './ValueEditorModal';
import { FINE_SECONDS_BELOW, tickToValue, valueToTick } from './sliderTicks';

export { FINE_SECONDS_BELOW } from './sliderTicks';

export interface SliderFieldProps {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  /**
   * Below this value the slider moves one unit at a time instead of `step`,
   * so short holds (a 3 s rest, a 7 s hang, a 2 s PT contraction) are
   * reachable by dragging and not only by typing. Above it the coarse step
   * keeps long intervals quick to set. Omit for a uniform `step`.
   */
  fineBelow?: number;
  isTime?: boolean;
  colors: Colors;
}

import { t } from '../i18n';
import {
  fontFamily,
  space,
  radius,
  type as ty,
  hairline,
  Colors,
} from '../theme';

export function formatSliderValue(
  value: number,
  isTime: boolean
): { display: string; unit: string } {
  if (!isTime) return { display: String(value), unit: '' };
  if (value < 60) return { display: String(value), unit: 's' };
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return { display: `${mins}:${String(secs).padStart(2, '0')}`, unit: '' };
}

export function spokenSliderValue(value: number, isTime: boolean): string {
  if (!isTime) return String(value);
  if (value < 60) return `${value} second${value !== 1 ? 's' : ''}`;
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  const minPart = `${mins} minute${mins !== 1 ? 's' : ''}`;
  return secs > 0 ? `${minPart} ${secs} seconds` : minPart;
}

export function SliderField({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max,
  step = 5,
  fineBelow,
  isTime = false,
  colors: c,
}: SliderFieldProps) {
  const sf = sliderFieldStyles(c);
  const toTick = (v: number) => valueToTick(v, min, step, fineBelow);
  const fromTick = (t: number) => Math.min(max, Math.max(min, tickToValue(t, min, step, fineBelow)));
  const maxTick = toTick(max);
  const { display, unit } = formatSliderValue(value, isTime);
  const spokenValue = spokenSliderValue(value, isTime);
  const [editing, setEditing] = useState(false);

  return (
    <View
      style={sf.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}, ${spokenValue}`}
      accessibilityHint={t('slider.activateHint', { hint })}
      accessibilityActions={[
        { name: 'increment', label: t('a11y.increase') },
        { name: 'decrement', label: t('a11y.decrease') },
        { name: 'activate', label: t('slider.enterExactValue') },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          onChange(fromTick(Math.min(maxTick, toTick(value) + 1)));
        }
        if (event.nativeEvent.actionName === 'decrement') {
          onChange(fromTick(Math.max(0, toTick(value) - 1)));
        }
        if (event.nativeEvent.actionName === 'activate') {
          setEditing(true);
        }
      }}
    >
      <View style={sf.headerRow} importantForAccessibility="no-hide-descendants">
        <Text style={sf.label}>{label}</Text>
        <Pressable
          style={({ pressed }) => [sf.valueCell, pressed && sf.valueCellPressed]}
          onPress={() => setEditing(true)}
          hitSlop={8}
        >
          <Text style={sf.valueText}>{display}</Text>
          {unit ? <Text style={sf.unit}>{unit}</Text> : null}
        </Pressable>
      </View>

      <ValueEditorModal
        visible={editing}
        label={label}
        value={value}
        isTime={isTime}
        min={min}
        max={max}
        onSave={(v) => {
          onChange(v);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
      <Slider
        style={sf.slider}
        minimumValue={0}
        maximumValue={maxTick}
        step={1}
        value={toTick(value)}
        onValueChange={(tick) => onChange(fromTick(tick))}
        minimumTrackTintColor={c.fg}
        maximumTrackTintColor={c.hairlineStrong}
        thumbTintColor={c.fg}
        accessible={false}
      />
      <Text style={sf.hint} importantForAccessibility="no">{hint}</Text>
    </View>
  );
}

function sliderFieldStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
      borderTopWidth: hairline,
      borderTopColor: c.hairline,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    label: { ...ty.sm, color: c.fg, fontFamily: fontFamily.sansMedium },
    valueCell: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: c.bgSubtle,
      borderRadius: radius.sm,
      paddingHorizontal: space.s3,
      paddingVertical: space.s1,
    },
    valueCellPressed: { opacity: 0.6 },
    valueText: {
      ...ty.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      textAlign: 'right',
      paddingVertical: 0,
      minWidth: 24,
    },
    unit: {
      ...ty.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.mono,
      marginLeft: 1,
    },
    slider: {
      width: '100%',
      height: 32,
      marginTop: space.s1,
    },
    hint: { ...ty.xs, color: c.fgMuted, fontFamily: fontFamily.sans, marginTop: 2 },
  });
}
