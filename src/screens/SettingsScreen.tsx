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
  Switch,
} from 'react-native';
import * as Speech from 'expo-speech';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, SoundSettings, SoundStyle, ALL_SOUND_STYLES, TONE_SOUND_STYLES, SOUND_STYLE_LABELS } from '../types';
import { loadSettings, saveSettings } from '../storage/storage';
import { DEFAULT_SETTINGS } from '../constants/defaultTimers';
import { AudioEngine } from '../audio/AudioEngine';

const VOICE_PREVIEW_PHRASES: Partial<Record<keyof Omit<SoundSettings, 'countdownDuration'>, string>> = {
  warmUpStart: 'Warm Up',
  workStart: 'Exercise',
  restStart: 'Rest',
  recoveryStart: 'Recovery',
  coolDownStart: 'Cool Down',
  workoutComplete: 'Workout Complete',
  halfwaySound: 'Halfway',
};

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
  { key: 'halfwaySound', label: 'Halfway Through Interval' },
];

export default function SettingsScreen({ navigation }: Props) {
  const isDark = useColorScheme() === 'dark';
  const s = makeStyles(isDark);

  const [sounds, setSounds] = useState<SoundSettings>(DEFAULT_SETTINGS.sounds);
  const [audioMode, setAudioMode] = useState(DEFAULT_SETTINGS.audioAccessibilityMode);

  useFocusEffect(
    useCallback(() => {
      loadSettings().then((settings) => {
        setSounds(settings.sounds);
        setAudioMode(settings.audioAccessibilityMode);
      });
    }, [])
  );

  const updateSound = async (key: keyof Omit<SoundSettings, 'countdownDuration'>, value: SoundStyle) => {
    const updated = { ...sounds, [key]: value };
    setSounds(updated);
    await saveSettings({ sounds: updated, audioAccessibilityMode: audioMode });
    if (value === 'voice') {
      const phrase = VOICE_PREVIEW_PHRASES[key];
      if (phrase) Speech.speak(phrase, { language: 'en-US' });
    } else if (value !== 'none') {
      AudioEngine.playSound(value).catch(() => {});
    }
  };

  const updateCountdownDuration = async (value: number) => {
    const updated = { ...sounds, countdownDuration: value };
    setSounds(updated);
    await saveSettings({ sounds: updated, audioAccessibilityMode: audioMode });
  };

  const updateAudioMode = async (value: boolean) => {
    setAudioMode(value);
    await saveSettings({ sounds, audioAccessibilityMode: value });
  };

  const handleReset = () => {
    Alert.alert('Reset to Defaults', 'Restore all settings to defaults?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          setSounds(DEFAULT_SETTINGS.sounds);
          setAudioMode(DEFAULT_SETTINGS.audioAccessibilityMode);
          await saveSettings(DEFAULT_SETTINGS);
        },
      },
    ]);
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
        <Text style={s.headerTitle} accessibilityRole="header">Settings</Text>
        <TouchableOpacity
          onPress={handleReset}
          hitSlop={8}
          accessibilityLabel="Reset to defaults"
          accessibilityRole="button"
          accessibilityHint="Restores all sound settings to their defaults"
        >
          <Text style={s.headerReset}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Accessibility */}
        <Text style={s.sectionHeader} accessibilityRole="header">ACCESSIBILITY</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLabel} importantForAccessibility="no-hide-descendants">
              <Text style={s.rowTitle}>Voice Cues</Text>
              <Text style={s.rowHint}>Speaks phase name, set, and duration aloud during your workout</Text>
            </View>
            <Switch
              value={audioMode}
              onValueChange={updateAudioMode}
              trackColor={{ false: '#767577', true: '#1D4ED8' }}
              thumbColor="#FFFFFF"
              accessibilityRole="switch"
              accessibilityLabel="Voice Cues, speaks phase name, set, and duration aloud during your workout"
              accessibilityState={{ checked: audioMode }}
            />
          </View>
        </View>

        {/* Countdown Duration */}
        <Text style={s.sectionHeader} accessibilityRole="header">COUNTDOWN</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={s.rowLabel}
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel="Countdown Duration. Seconds of beeping before each interval. Zero is off."
            >
              <Text style={s.rowTitle} importantForAccessibility="no">Countdown Duration</Text>
              <Text style={s.rowHint} importantForAccessibility="no">Seconds of beeping before each interval (0 = off)</Text>
            </View>
            <View
              style={s.stepper}
              accessible={true}
              accessibilityRole="adjustable"
              accessibilityLabel={
                sounds.countdownDuration === 0
                  ? 'Off'
                  : `${sounds.countdownDuration} second${sounds.countdownDuration !== 1 ? 's' : ''}`
              }
              accessibilityHint="Swipe up to increase, swipe down to decrease"
              accessibilityActions={[
                { name: 'increment', label: 'increase' },
                { name: 'decrement', label: 'decrease' },
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'increment')
                  updateCountdownDuration(Math.min(10, sounds.countdownDuration + 1));
                if (event.nativeEvent.actionName === 'decrement')
                  updateCountdownDuration(Math.max(0, sounds.countdownDuration - 1));
              }}
            >
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => updateCountdownDuration(Math.max(0, sounds.countdownDuration - 1))}
                accessible={false}
                importantForAccessibility="no"
              >
                <Text style={s.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={s.stepValue} importantForAccessibility="no">
                {sounds.countdownDuration}s
              </Text>
              <TouchableOpacity
                style={s.stepBtn}
                onPress={() => updateCountdownDuration(Math.min(10, sounds.countdownDuration + 1))}
                accessible={false}
                importantForAccessibility="no"
              >
                <Text style={s.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Sound Events */}
        <Text style={s.sectionHeader} accessibilityRole="header">SOUNDS</Text>
        <Text style={s.sectionHint}>Tap a sound to preview it.</Text>
        <View style={s.card}>
          {SOUND_EVENTS.map((event, idx) => (
            <View key={event.key} style={[s.soundRow, idx > 0 && s.soundRowBorder]}>
              <Text style={s.soundEventLabel}>{event.label}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.pillRow}
                accessibilityRole="radiogroup"
                accessibilityLabel={`${event.label} sound`}
              >
                {(event.key === 'countdownTick' ? TONE_SOUND_STYLES : ALL_SOUND_STYLES).map((style) => {
                  const active = sounds[event.key] === style;
                  return (
                    <TouchableOpacity
                      key={style}
                      style={[s.pill, active && s.pillActive]}
                      onPress={() => updateSound(event.key, style)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={SOUND_STYLE_LABELS[style]}
                      accessibilityHint={active ? 'Currently selected' : 'Tap to select and preview'}
                    >
                      <Text style={[s.pillText, active && s.pillTextActive]} importantForAccessibility="no">
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
        <Text style={s.sectionHeader} accessibilityRole="header">ABOUT</Text>
        <View style={s.card}>
          <TouchableOpacity
            style={s.row}
            onPress={() => Linking.openURL('https://buymeacoffee.com/jtysonwilliams')}
            accessibilityLabel="Buy me a coffee"
            accessibilityRole="link"
            accessibilityHint="Opens buymeacoffee.com in your browser"
          >
            <Text style={s.rowTitle}>☕  Buy me a coffee?</Text>
            <Text style={s.chevron} importantForAccessibility="no">›</Text>
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
  const sub = isDark ? '#888' : '#6B6B6B';
  const border = isDark ? '#2A2A2A' : '#E8E8E8';
  const btnBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const pillActiveBg = '#1D4ED8';

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
    headerReset: { fontSize: 15, color: '#C81C1C' },
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
      borderWidth: 1,
      borderColor: isDark ? '#737373' : '#AAAAAA',
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
