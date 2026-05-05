import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import {
  fontFamily,
  space,
  type as t,
  hairline,
  Colors,
} from '../theme';

export interface SliderFieldProps {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  isTime?: boolean;
  colors: Colors;
}

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
  isTime = false,
  colors: c,
}: SliderFieldProps) {
  const sf = sliderFieldStyles(c);
  const { display, unit } = formatSliderValue(value, isTime);
  const spokenValue = spokenSliderValue(value, isTime);

  return (
    <View
      style={sf.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}, ${spokenValue}`}
      accessibilityHint={hint}
      accessibilityActions={[
        { name: 'increment', label: 'increase' },
        { name: 'decrement', label: 'decrease' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') {
          onChange(Math.min(max, value + step));
        }
        if (event.nativeEvent.actionName === 'decrement') {
          onChange(Math.max(min, value - step));
        }
      }}
    >
      <View style={sf.headerRow} importantForAccessibility="no-hide-descendants">
        <Text style={sf.label}>{label}</Text>
        <View style={sf.valueCell}>
          <Text style={sf.valueText}>{display}</Text>
          {unit ? <Text style={sf.unit}>{unit}</Text> : null}
        </View>
      </View>
      <Slider
        style={sf.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={(v) => onChange(Math.round(v))}
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
    label: { ...t.sm, color: c.fg, fontFamily: fontFamily.sansMedium },
    valueCell: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    valueText: {
      ...t.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      textAlign: 'right',
      paddingVertical: 0,
      minWidth: 24,
    },
    unit: {
      ...t.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.mono,
      marginLeft: 1,
    },
    slider: {
      width: '100%',
      height: 32,
      marginTop: space.s1,
    },
    hint: { ...t.xs, color: c.fgMuted, fontFamily: fontFamily.sans, marginTop: 2 },
  });
}
