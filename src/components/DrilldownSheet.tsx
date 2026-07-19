/**
 * Canonical, app-agnostic — synced by `sync.mjs drilldown`; do not fork.
 *
 * The focused editor a DrilldownRow opens — one dimension, one pane. The pane
 * is SELF-CONTAINED in the presenting screen: it slides in from the right and
 * covers the screen while the hub stays mounted beneath, so it behaves
 * identically whether the screen is a plain push or a modal/bottom-sheet
 * presentation. A full-screen Modal must never open on top of a sheet
 * (UX guideline, Josh 2026-07-18) — that's why this is a pane, not a Modal.
 *
 * Placement contract: render it at the SCREEN ROOT — a sibling of the scroll
 * content, directly under the screen's SafeAreaView — never inside a
 * ScrollView (it fills its nearest positioned ancestor). While a pane is
 * open, give the hub content `accessibilityElementsHidden` +
 * `importantForAccessibility="no-hide-descendants"` so screen readers stay
 * contained. Android hardware back closes the pane.
 *
 * Also exports SheetOption — the standard row for LONG or rich lists
 * (leading elements, detail lines, unbounded sets). Short single-select
 * option sets use OptionChips instead (OptionChips.tsx).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  BackHandler,
  useWindowDimensions,
  AccessibilityInfo,
  StyleSheet,
} from 'react-native';
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
  const { width } = useWindowDimensions();
  /** Stays mounted through the exit slide; 0 = in place, 1 = offscreen right. */
  const [rendered, setRendered] = useState(visible);
  const x = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      if (reduceMotion) {
        x.setValue(0);
        return;
      }
      Animated.timing(x, { toValue: 0, duration: 240, useNativeDriver: true }).start();
    } else {
      if (reduceMotion) {
        x.setValue(1);
        setRendered(false);
        return;
      }
      Animated.timing(x, { toValue: 1, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setRendered(false);
        }
      );
    }
  }, [visible, reduceMotion, x]);

  // Hardware back closes the pane, not the screen (parity with the old
  // Modal's onRequestClose).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!rendered) return null;

  return (
    <Animated.View
      style={[
        s.pane,
        {
          transform: [
            { translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, width] }) },
          ],
        },
      ]}
      accessibilityViewIsModal
    >
      <ScreenHeader title={title} onBack={onClose} right={right} />
      {children}
    </Animated.View>
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
    pane: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.bg,
      zIndex: 10,
      elevation: 10,
    },
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
