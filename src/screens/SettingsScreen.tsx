import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Linking,
  Alert,
  Switch,
} from 'react-native';
import * as Speech from 'expo-speech';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ChevronLeft,
  Coffee,
  Mail,
  Minus,
  Plus,
} from 'lucide-react-native';
import {
  RootStackParamList,
  SoundSettings,
  SoundStyle,
  ALL_SOUND_STYLES,
  SOUND_STYLE_LABELS,
} from '../types';
import { loadSettings, saveSettings } from '../storage/storage';
import { DEFAULT_SETTINGS } from '../constants/defaultTimers';
import { AudioEngine } from '../audio/AudioEngine';
import { buildFeedbackEmailUrl } from '../utils/feedback';
import Wordmark from '../components/Wordmark';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as t,
  hairline,
  tracking,
  Colors,
} from '../theme';

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
  { key: 'warmUpStart', label: 'Warm up start' },
  { key: 'workStart', label: 'Exercise start' },
  { key: 'restStart', label: 'Rest start' },
  { key: 'recoveryStart', label: 'Recovery start' },
  { key: 'coolDownStart', label: 'Cool down start' },
  { key: 'workoutComplete', label: 'Workout complete' },
  { key: 'halfwaySound', label: 'Halfway through interval' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

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
    Alert.alert('Reset to defaults', 'Restore all settings to defaults?', [
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
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
          style={({ pressed }) => [s.headerSide, pressed && s.pressed]}
        >
          <ChevronLeft size={22} color={c.fg} strokeWidth={1.5} />
          <Text style={s.headerBackText}>Back</Text>
        </Pressable>
        <Text style={s.headerTitle} accessibilityRole="header">Settings</Text>
        <Pressable
          onPress={handleReset}
          hitSlop={8}
          accessibilityLabel="Reset to defaults"
          accessibilityRole="button"
          accessibilityHint="Restores all sound settings to their defaults"
          style={({ pressed }) => [s.headerSide, s.headerSideRight, pressed && s.pressed]}
        >
          <Text style={s.headerReset}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionHeader} accessibilityRole="header">Accessibility</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLabel} importantForAccessibility="no-hide-descendants">
              <Text style={s.rowTitle}>Voice cues</Text>
              <Text style={s.rowHint}>Speaks phase name, set, and duration aloud during your workout.</Text>
            </View>
            <Switch
              value={audioMode}
              onValueChange={updateAudioMode}
              trackColor={{ false: c.hairlineStrong, true: c.fg }}
              thumbColor={c.bgElevated}
              ios_backgroundColor={c.hairlineStrong}
              accessibilityRole="switch"
              accessibilityLabel="Voice cues"
              accessibilityState={{ checked: audioMode }}
            />
          </View>
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">Countdown</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={s.rowLabel}
              accessible
              accessibilityRole="text"
              accessibilityLabel="Countdown duration. Seconds of beeping before each interval. Zero is off."
            >
              <Text style={s.rowTitle} importantForAccessibility="no">Countdown duration</Text>
              <Text style={s.rowHint} importantForAccessibility="no">Seconds of beeping before each interval (0 = off).</Text>
            </View>
            <View
              style={s.stepper}
              accessible
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
              <Pressable
                style={({ pressed }) => [s.stepBtn, pressed && s.pressed]}
                onPress={() => updateCountdownDuration(Math.max(0, sounds.countdownDuration - 1))}
                accessible={false}
                importantForAccessibility="no"
              >
                <Minus size={16} color={c.fg} strokeWidth={1.75} />
              </Pressable>
              <Text style={s.stepValue} importantForAccessibility="no">
                {sounds.countdownDuration}s
              </Text>
              <Pressable
                style={({ pressed }) => [s.stepBtn, pressed && s.pressed]}
                onPress={() => updateCountdownDuration(Math.min(10, sounds.countdownDuration + 1))}
                accessible={false}
                importantForAccessibility="no"
              >
                <Plus size={16} color={c.fg} strokeWidth={1.75} />
              </Pressable>
            </View>
          </View>
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">Sounds</Text>
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
                {ALL_SOUND_STYLES.map((style) => {
                  const active = sounds[event.key] === style;
                  return (
                    <Pressable
                      key={style}
                      style={({ pressed }) => [
                        s.pill,
                        active && s.pillActive,
                        pressed && s.pressed,
                      ]}
                      onPress={() => updateSound(event.key, style)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={SOUND_STYLE_LABELS[style]}
                      accessibilityHint={active ? 'Currently selected' : 'Tap to select and preview'}
                    >
                      <Text style={[s.pillText, active && s.pillTextActive]} importantForAccessibility="no">
                        {SOUND_STYLE_LABELS[style]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ))}
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">About</Text>
        <View style={s.card}>
          <View style={s.row}>
            <Text style={s.rowTitle}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
        </View>

        <View style={s.aboutButtons}>
          <Pressable
            style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}
            onPress={() => Linking.openURL('https://buymeacoffee.com/jtysonwilliams')}
            accessibilityLabel="Buy me a coffee"
            accessibilityRole="link"
            accessibilityHint="Opens buymeacoffee.com in your browser"
          >
            <Coffee size={18} color={c.fg} strokeWidth={1.5} />
            <Text style={s.secondaryButtonText}>Buy me a coffee</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.secondaryButton, pressed && s.pressed]}
            onPress={() => Linking.openURL(buildFeedbackEmailUrl())}
            accessibilityLabel="Send feedback"
            accessibilityRole="link"
            accessibilityHint="Opens your email app to send feedback or report a bug"
          >
            <Mail size={18} color={c.fg} strokeWidth={1.5} />
            <Text style={s.secondaryButtonText}>Send feedback</Text>
          </Pressable>
        </View>

        <View style={s.stamp}>
          <Wordmark />
          <Text style={s.stampText}>
            Made by two people. Your data stays on your device. The code is on GitHub.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.s5,
      paddingVertical: space.s3,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
    headerSide: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s1,
    },
    headerSideRight: { justifyContent: 'flex-end' },
    pressed: { opacity: 0.7 },
    headerBackText: { ...t.base, color: c.fg, fontFamily: fontFamily.sans },
    headerTitle: {
      ...t.base,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
      textAlign: 'center',
    },
    headerReset: { ...t.sm, color: c.danger, fontFamily: fontFamily.sansMedium },

    scroll: { padding: space.s5, paddingBottom: space.s8 },
    sectionHeader: {
      ...t.xs,
      fontFamily: fontFamily.sansMedium,
      color: c.fgMuted,
      letterSpacing: tracking.wide,
      textTransform: 'uppercase',
      marginBottom: space.s3,
      marginTop: space.s3,
      paddingHorizontal: space.s1,
    },
    sectionHint: {
      ...t.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
      marginBottom: space.s3,
      paddingHorizontal: space.s1,
      marginTop: -space.s2,
    },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: space.s6,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
    },
    rowLabel: { flex: 1, marginRight: space.s4 },
    rowTitle: { ...t.sm, color: c.fg, fontFamily: fontFamily.sansMedium },
    rowHint: { ...t.xs, color: c.fgMuted, fontFamily: fontFamily.sans, marginTop: 2 },
    rowValue: { ...t.sm, color: c.fgMuted, fontFamily: fontFamily.mono },

    aboutButtons: { gap: space.s3, marginBottom: space.s6 },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.s3,
      minHeight: 44,
      paddingHorizontal: space.s5,
      paddingVertical: space.s3,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bgElevated,
    },
    secondaryButtonText: {
      ...t.sm,
      color: c.fg,
      fontFamily: fontFamily.sansMedium,
    },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
    stepBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepValue: {
      ...t.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      minWidth: 36,
      textAlign: 'center',
    },

    soundRow: { paddingHorizontal: space.s5, paddingVertical: space.s4 },
    soundRowBorder: { borderTopWidth: hairline, borderTopColor: c.hairline },
    soundEventLabel: {
      ...t.sm,
      fontFamily: fontFamily.sansMedium,
      color: c.fg,
      marginBottom: space.s3,
    },
    pillRow: { flexDirection: 'row', gap: space.s2 },
    pill: {
      paddingHorizontal: space.s4,
      paddingVertical: space.s2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bg,
    },
    pillActive: { backgroundColor: c.fg, borderColor: c.fg },
    pillText: { ...t.sm, color: c.fg, fontFamily: fontFamily.sans },
    pillTextActive: { color: c.bg, fontFamily: fontFamily.sansMedium },

    stamp: { alignItems: 'center', paddingVertical: space.s5, gap: space.s3 },
    stampText: {
      ...t.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
      textAlign: 'center',
      paddingHorizontal: space.s6,
    },
  });
}
