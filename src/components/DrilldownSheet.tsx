/**
 * Canonical, app-agnostic — synced by `sync.mjs drilldown`; do not fork.
 *
 * The focused editor a DrilldownRow opens — one dimension, one screen. A
 * slide-up full-height sheet with the standard header, so deep option sets
 * get room to breathe instead of crowding the hub inline. Also exports
 * SheetOption, the standard single-select row (label + check) used by the
 * pickers that live in these sheets.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, AccessibilityInfo, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { ScreenHeader } from './ScreenHeader';
import {
  useTheme,
  fontFamily,
  space,
  target,
  type as ty,
  hairline,
  boundedContent,
  type Colors,
} from '../theme';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Optional header action (a confirm button) rendered in the trailing slot. */
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function DrilldownSheet({ visible, title, onClose, right, children }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      transparent
    >
      <SafeAreaProvider>
        <SafeAreaView style={s.sheet} edges={['top', 'bottom', 'left', 'right']}>
          <ScreenHeader title={title} onBack={onClose} right={right} />
          {children}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

type OptionProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading element (a category dot). */
  leading?: React.ReactNode;
  /** Optional second line under the label. */
  detail?: string;
};

export function SheetOption({ label, selected, onPress, leading, detail }: OptionProps) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [s.option, pressed && s.pressed]}
    >
      {leading}
      <View style={s.optionText}>
        <Text style={[s.optionLabel, selected && s.optionLabelSelected]}>{label}</Text>
        {detail ? <Text style={s.optionDetail}>{detail}</Text> : null}
      </View>
      {selected ? <Check size={20} color={c.fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pressed: { opacity: 0.6 },
    sheet: { flex: 1, backgroundColor: c.bg },
    option: {
      ...boundedContent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s4,
      minHeight: target.min + 6,
      paddingHorizontal: space.s6,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
    optionText: { flex: 1, paddingVertical: space.s3, gap: 2 },
    optionLabel: { ...ty.base, fontFamily: fontFamily.sans, color: c.fg },
    optionLabelSelected: { fontFamily: fontFamily.sansSemibold },
    optionDetail: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted },
  });
}
