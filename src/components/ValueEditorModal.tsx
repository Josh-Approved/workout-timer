import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
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
      {/* Lift the card above the on-screen keyboard so the single Done button
          is always tappable — the old layout let the keyboard cover the lower
          buttons. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Tapping outside the card dismisses without saving — the only
            non-Done exit now that there's no Cancel button. Standard on both
            platforms; the Android back / screen-reader escape gesture routes
            to onRequestClose. accessible={false} keeps the scrim out of the
            VoiceOver/TalkBack order (they dismiss via the escape gesture). */}
        <Pressable style={s.overlay} onPress={onCancel} accessible={false}>
          {/* The card swallows touches so a tap inside never reaches the scrim. */}
          <Pressable style={s.card} onPress={() => {}} accessible={false}>
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
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
    },
    primaryBtnText: {
      ...t.base,
      fontFamily: fontFamily.sansSemibold,
      color: c.inkButtonText,
    },
    pressed: { opacity: 0.7 },
  });
}
