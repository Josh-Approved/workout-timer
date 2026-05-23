import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as t,
  hairline,
  Colors,
} from '../theme';

interface Props {
  visible: boolean;
  /** Field name shown as the title — sentence case (e.g. "Exercise"). */
  label: string;
  /** Current value, in seconds when isTime, otherwise a plain count. */
  value: number;
  isTime: boolean;
  min: number;
  max: number;
  onSave: (v: number) => void;
  onCancel: () => void;
}

export default function ValueEditorModal({
  visible,
  label,
  value,
  isTime,
  min,
  max,
  onSave,
  onCancel,
}: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

  const minRef = useRef<TextInput>(null);
  const secRef = useRef<TextInput>(null);
  const countRef = useRef<TextInput>(null);

  const [minStr, setMinStr] = useState('');
  const [secStr, setSecStr] = useState('');
  const [countStr, setCountStr] = useState('');

  // Seed the inputs from the current value each time the editor opens.
  useEffect(() => {
    if (!visible) return;
    if (isTime) {
      setMinStr(String(Math.floor(value / 60)));
      setSecStr(String(value % 60));
    } else {
      setCountStr(String(value));
    }
  }, [visible, value, isTime]);

  const handleSave = () => {
    const raw = isTime
      ? (parseInt(minStr, 10) || 0) * 60 + (parseInt(secStr, 10) || 0)
      : parseInt(countStr, 10) || 0;
    onSave(Math.max(min, Math.min(max, raw)));
  };

  const focusFirst = () => {
    if (isTime) {
      (value >= 60 ? minRef : secRef).current?.focus();
    } else {
      countRef.current?.focus();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
      onShow={focusFirst}
    >
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title} accessibilityRole="header">{label}</Text>

          {isTime ? (
            <View style={s.timeRow}>
              <View style={s.field}>
                <TextInput
                  ref={minRef}
                  style={s.input}
                  value={minStr}
                  onChangeText={setMinStr}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  accessibilityLabel={`${label} minutes`}
                />
                <Text style={s.caption}>min</Text>
              </View>
              <View style={s.field}>
                <TextInput
                  ref={secRef}
                  style={s.input}
                  value={secStr}
                  onChangeText={setSecStr}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  accessibilityLabel={`${label} seconds`}
                />
                <Text style={s.caption}>sec</Text>
              </View>
            </View>
          ) : (
            <View style={s.countRow}>
              <TextInput
                ref={countRef}
                style={s.input}
                value={countStr}
                onChangeText={setCountStr}
                keyboardType="number-pad"
                maxLength={3}
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
                accessibilityLabel={label}
              />
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
            <Text style={s.primaryBtnText}>Done</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={8}
          >
            <Text style={s.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.bgScrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space.s7,
    },
    card: {
      width: '100%',
      backgroundColor: c.bgElevated,
      borderRadius: radius.lg,
      borderWidth: hairline,
      borderColor: c.hairline,
      padding: space.s7,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 10,
    },
    title: {
      ...t.md,
      fontFamily: fontFamily.sansSemibold,
      color: c.fg,
      textAlign: 'center',
      marginBottom: space.s6,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: space.s5,
      marginBottom: space.s6,
    },
    countRow: {
      marginBottom: space.s6,
    },
    field: { alignItems: 'center' },
    input: {
      ...t.md,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      textAlign: 'center',
      borderWidth: hairline,
      borderColor: c.hairlineStrong,
      borderRadius: radius.md,
      backgroundColor: c.bg,
      paddingVertical: space.s3,
      paddingHorizontal: space.s4,
      minWidth: 88,
    },
    caption: {
      ...t.xs,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      marginTop: space.s2,
    },
    primaryBtn: {
      backgroundColor: c.inkButton,
      borderRadius: radius.md,
      paddingVertical: space.s4,
      paddingHorizontal: space.s7,
      width: '100%',
      alignItems: 'center',
      marginBottom: space.s3,
    },
    primaryBtnText: {
      ...t.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.inkButtonText,
    },
    secondaryBtn: { paddingVertical: space.s2 },
    secondaryBtnText: {
      ...t.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
    },
    pressed: { opacity: 0.7 },
  });
}
