import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
  Linking,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, SoundSettings, SoundStyle, ALL_SOUND_STYLES, SOUND_STYLE_LABELS } from '../types';
import { loadSettings, saveSettings } from '../storage/storage';
import { DEFAULT_SETTINGS } from '../constants/defaultTimers';
import { AudioEngine } from '../audio/AudioEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

interface SoundEventRow {
  key: keyof Omit<SoundSettings, 'countdownDuration'>;
  label: string;
}

const SOUND_EVENTS: SoundEventRow[] = [
  { key: 'countdownTick', label: 'Countdown Tick' },
  { key: 'warmUpStart', label: 'Warm Up Start' },
  { key: 'workStart', label: 'Exercise Start' },
  { key: 'restStart', label: 'Rest Start' },
  { key: 'recoveryStart', label: 'Recovery Start' },
  { key: 'coolDownStart', label: 'Cool Down Start' },
  { key: 'workoutComplete', label: 'Workout Complete' },
];

export default function SettingsScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = makeStyles(isDark);

  const [sounds, setSounds] = useState<SoundSettings>(DEFAULT_SETTINGS.sounds);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then((settings) => setSounds(settings.sounds));
    }, [])
  );

  const updateSound = async (key: keyof Omit<SoundSettings, 'countdownDuration'>, value: SoundStyle) => {
    const updated = { ...sounds, [key]: value };
    setSounds(updated);
    await saveSettings({ sounds: updated });
    if (value !== 'none') {
      AudioEngine.playSound(value).catch(() => {});
    }
  };

  const updateCountdownDuration = async (value: number) => {
    const updated = { ...sounds, countdownDuration: value };
    setSounds(updated);
    await saveSettings({ sounds: updated });
  };

  const handleReset = () => {
    Alert.alert('Reset to Defaults', 'Restore all sound settings to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setSounds(DEFAULT_SETTINGS.sounds);
          await saveSettings(DEFAULT_SETTINGS);
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={s.headerBack}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <TouchableOpacity onPress={handleReset} hitSlop={8}>
          <Text style={s.headerReset}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Countdown Duration */}
        <Text style={s.sectionHeader}>COUNTDOWN</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLabel}>
              <Text style={s.rowTitle}>Countdown Duration</Text>
              <Text style={s.rowHint}>Seconds of beeping before each interval (0 = off)</Text>
            </View>
            <View style={s.stepper}>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => updateCountdownDuration(Math.max(0, sounds.countdownDuration - 1))}
              >
                <Text style={s.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.stepValue}>{sounds.countdownDuration}s</Text>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => updateCountdownDuration(Math.min(10, sounds.countdownDuration + 1))}
              >
                <Text style={s.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sound Events */}
        <Text style={s.sectionHeader}>SOUNDS</Text>
        <Text style={s.sectionHint}>Tap a sound to preview it.</Text>
        <View style={s.card}>
          {SOUND_EVENTS.map((event, idx) => (
            <View key={event.key} style={[s.soundRow, idx > 0 && s.soundRowBorder]}>
              <Text style={s.soundEventLabel}>{event.label}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.pillRow}
              >
                {ALL_SOUND_STYLES.map((style) => {
                  const active = sounds[event.key] === style;
                  return (
                    <TouchableOpacity
                      key={style}
                      style={[s.pill, active && s.pillActive]}
                      onPress={() => updateSound(event.key, style)}
                    >
                      <Text style={[s.pillText, active && s.pillTextActive]}>
                        {SOUND_STYLE_LABELS[style]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ))}
        </View>

        {/* About */}
        <Text style={s.sectionHeader}>ABOUT</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => Linking.openURL('https://buymeacoffee.com/jtysonwilliams')}
          >
            <Text style={s.rowTitle}>☕  Buy me a coffee</Text>
            <Text style={s.chevron}>›</Text>
          </TouchableOpacity>
          <View style={[s.row, s.rowBorder]}>
            <Text style={s.rowTitle}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? '#121212' : '#F5F5F5';
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#888' : '#888';
  const border = isDark ? '#2A2A2A' : '#E8E8E8';
  const btnBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const pillActiveBg = '#3B82F6';

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
    headerBack: { fontSize: 17, color: '#3B82F6' },
    headerTitle: { fontSize: 17, fontWeight: '600', color: text },
    headerReset: { fontSize: 15, color: '#EF4444' },
    scroll: { padding: 16, paddingBottom: 60 },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '600',
      color: sub,
      letterSpacing: 0.8,
      marginBottom: 6,
      marginTop: 8,
      paddingHorizontal: 4,
    },
    sectionHint: {
      fontSize: 12,
      color: sub,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: cardBg,
      borderRadius: 14,
      marginBottom: 24,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    rowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    rowLabel: { flex: 1, marginRight: 12 },
    rowTitle: { fontSize: 15, color: text, fontWeight: '500' },
    rowHint: { fontSize: 12, color: sub, marginTop: 2 },
    rowValue: { fontSize: 15, color: sub },
    chevron: { fontSize: 20, color: sub },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stepBtn: {
      backgroundColor: btnBg,
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepBtnText: { fontSize: 20, color: text, lineHeight: 24 },
    stepValue: { fontSize: 16, fontWeight: '600', color: text, minWidth: 32, textAlign: 'center' },
    soundRow: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    soundRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
    },
    soundEventLabel: { fontSize: 14, fontWeight: '500', color: text, marginBottom: 8 },
    pillRow: { flexDirection: 'row', gap: 8 },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: btnBg,
    },
    pillActive: { backgroundColor: pillActiveBg },
    pillText: { fontSize: 13, color: text },
    pillTextActive: { color: '#FFFFFF', fontWeight: '600' },
  });
}
