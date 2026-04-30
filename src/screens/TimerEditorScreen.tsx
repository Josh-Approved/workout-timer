import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers, saveTimer, deleteTimer } from '../storage/storage';
import { generateId } from '../utils/workout';

type Props = NativeStackScreenProps<RootStackParamList, 'TimerEditor'>;

const EMPTY_TIMER: Omit<TimerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  initialCountdown: 0,
  warmUp: 0,
  exercise: 20,
  rest: 10,
  sets: 8,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
};

export default function TimerEditorScreen({ route, navigation }: Props) {
  const { timerId } = route.params ?? {};
  const isDark = useColorScheme() === 'dark';
  const s = makeStyles(isDark);

  const [form, setForm] = useState({ ...EMPTY_TIMER });

  useEffect(() => {
    if (timerId) {
      loadTimers().then((timers) => {
        const t = timers.find((x) => x.id === timerId);
        if (t) {
          const { id, createdAt, updatedAt, ...fields } = t;
          setForm(fields);
        }
      });
    }
  }, [timerId]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Name required', 'Please give your timer a name.');
      return;
    }
    if (form.exercise < 1) {
      Alert.alert('Exercise time required', 'Exercise interval must be at least 1 second.');
      return;
    }
    const timer: TimerConfig = {
      id: timerId ?? generateId(),
      ...form,
      name: form.name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTimer(timer);
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Timer',
      `Permanently delete "${form.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTimer(timerId!);
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Text style={s.headerBack}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} accessibilityRole="header">
          {timerId ? 'Edit Timer' : 'New Timer'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          hitSlop={8}
          accessibilityLabel="Save timer"
          accessibilityRole="button"
        >
          <Text style={s.headerSave}>Save</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Timer Name</Text>
            <TextInput
              style={s.nameInput}
              value={form.name}
              onChangeText={(v) => set('name', v)}
              placeholder="e.g. Leg Day Tabata"
              placeholderTextColor={isDark ? '#555' : '#BBB'}
              maxLength={60}
              returnKeyType="done"
              accessibilityLabel="Timer name"
              accessibilityHint="Enter a name for this timer"
            />
          </View>

          {/* Preparation */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Preparation</Text>
            <Field
              label="Initial Countdown"
              hint="Get-ready period before the workout starts (0 = skip)"
              value={form.initialCountdown}
              onChange={(v) => set('initialCountdown', v)}
              isDark={isDark}
            />
            <Field
              label="Warm Up"
              hint="Warm-up interval before first set (0 = skip)"
              value={form.warmUp}
              onChange={(v) => set('warmUp', v)}
              isDark={isDark}
            />
          </View>

          {/* Intervals */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Intervals</Text>
            <Field
              label="Exercise"
              hint="Work interval duration (required)"
              value={form.exercise}
              onChange={(v) => set('exercise', Math.max(1, v))}
              min={1}
              isDark={isDark}
            />
            <Field
              label="Rest"
              hint="Rest between exercise sets (0 = no rest)"
              value={form.rest}
              onChange={(v) => set('rest', v)}
              isDark={isDark}
            />
          </View>

          {/* Structure */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Structure</Text>
            <Field
              label="Sets"
              hint="Exercise + rest rounds per cycle"
              value={form.sets}
              onChange={(v) => set('sets', Math.max(1, v))}
              min={1}
              step={1}
              isDark={isDark}
            />
            <Field
              label="Cycles"
              hint="How many times to repeat all sets"
              value={form.cycles}
              onChange={(v) => set('cycles', Math.max(1, v))}
              min={1}
              step={1}
              isDark={isDark}
            />
            <Field
              label="Recovery"
              hint="Rest between cycles (0 = no recovery)"
              value={form.recovery}
              onChange={(v) => set('recovery', v)}
              isDark={isDark}
            />
          </View>

          {/* Cool Down */}
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">Finish</Text>
            <Field
              label="Cool Down"
              hint="Cool-down interval after the last set (0 = skip)"
              value={form.coolDown}
              onChange={(v) => set('coolDown', v)}
              isDark={isDark}
            />
          </View>

          {/* Delete — only shown when editing an existing timer */}
          {timerId ? (
            <TouchableOpacity
              style={s.deleteBtn}
              onPress={handleDelete}
              accessibilityLabel="Delete timer"
              accessibilityRole="button"
              accessibilityHint="Permanently removes this timer. Cannot be undone."
            >
              <Text style={s.deleteBtnText}>Delete Timer</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Field component ──────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  isDark: boolean;
}

function Field({ label, hint, value, onChange, min = 0, step = 5, isDark }: FieldProps) {
  const s = fieldStyles(isDark);

  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(value + step);

  const handleText = (text: string) => {
    const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n)) onChange(Math.max(min, n));
    else if (text === '') onChange(min);
  };

  const isTime = step !== 1;
  const spokenValue = isTime
    ? value < 60
      ? `${value} second${value !== 1 ? 's' : ''}`
      : `${Math.floor(value / 60)} minute${Math.floor(value / 60) !== 1 ? 's' : ''}${value % 60 > 0 ? ` ${value % 60} seconds` : ''}`
    : String(value);

  return (
    <View style={s.row} accessible={false}>
      {/* Label + hint hidden from accessibility — the TextInput carries the full label */}
      <View style={s.labelCol} importantForAccessibility="no-hide-descendants">
        <Text style={s.label}>{label}</Text>
        <Text style={s.hint}>{hint}</Text>
      </View>
      <View style={s.stepper} accessible={false}>
        {/* − button visible to sighted users only */}
        <TouchableOpacity
          style={s.stepBtn}
          onPress={decrement}
          accessible={false}
          importantForAccessibility="no"
        >
          <Text style={s.stepBtnText}>−</Text>
        </TouchableOpacity>

        {/* Single VoiceOver/TalkBack focus point: adjustable role, swipe up/down to change */}
        <TextInput
          style={s.stepInput}
          value={String(value)}
          keyboardType="number-pad"
          onChangeText={handleText}
          selectTextOnFocus
          accessibilityRole="adjustable"
          accessibilityLabel={`${label}, ${spokenValue}`}
          accessibilityHint={`${hint}. Swipe up to increase, swipe down to decrease`}
          accessibilityActions={[
            { name: 'increment', label: 'increase' },
            { name: 'decrement', label: 'decrease' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') increment();
            if (event.nativeEvent.actionName === 'decrement') decrement();
          }}
        />
        {isTime ? <Text style={s.unit} importantForAccessibility="no">s</Text> : null}

        {/* + button visible to sighted users only */}
        <TouchableOpacity
          style={s.stepBtn}
          onPress={increment}
          accessible={false}
          importantForAccessibility="no"
        >
          <Text style={s.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(isDark: boolean) {
  const bg = isDark ? '#121212' : '#F5F5F5';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#888' : '#6B6B6B';
  const border = isDark ? '#2A2A2A' : '#E8E8E8';
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    headerBack: { fontSize: 17, color: '#1D4ED8' },
    headerTitle: { fontSize: 17, fontWeight: '600', color: text },
    headerSave: { fontSize: 17, color: '#1D4ED8', fontWeight: '600' },
    scroll: { padding: 16, paddingBottom: 60 },
    section: {
      backgroundColor: cardBg,
      borderRadius: 14,
      marginBottom: 16,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: sub,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 6,
    },
    nameInput: {
      fontSize: 17,
      color: isDark ? '#FFF' : '#111',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    deleteBtn: {
      backgroundColor: '#C81C1C',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
      marginBottom: 16,
    },
    deleteBtnText: {
      fontSize: 17,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}

function fieldStyles(isDark: boolean) {
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#999' : '#6B6B6B';
  const border = isDark ? '#2A2A2A' : '#E8E8E8';
  const btnBg = isDark ? '#2C2C2E' : '#F2F2F7';

  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    labelCol: { flex: 1, marginRight: 12 },
    label: { fontSize: 15, fontWeight: '500', color: text },
    hint: { fontSize: 12, color: sub, marginTop: 2 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stepBtn: {
      backgroundColor: btnBg,
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? '#737373' : '#AAAAAA',
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepBtnText: { fontSize: 20, color: text, lineHeight: 24 },
    stepInput: {
      fontSize: 16,
      fontWeight: '600',
      color: text,
      minWidth: 44,
      textAlign: 'center',
    },
    unit: { fontSize: 13, color: sub, marginLeft: 2 },
  });
}
