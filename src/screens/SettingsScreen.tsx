import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronLeft, Minus, Plus } from 'lucide-react-native';
import {
  RootStackParamList,
  SoundSettings,
  SoundStyle,
  SOUND_STYLE_LABELS,
} from '../types';
import { loadSettings, saveSettings } from '../storage/storage';
import { DEFAULT_SETTINGS } from '../constants/defaultTimers';
import { TIP_PRODUCT_IDS } from '../constants/tipProducts';
import TipJarSheet from '../components/TipJarSheet';
import { AudioEngine } from '../audio/AudioEngine';
import { t } from '../i18n';
import { AboutSection } from '../components/AboutSection';
import { LanguageSetting } from '../components/LanguageSetting';
import { DrilldownRow } from '../components/DrilldownRow';
import { SoundStyleSheet } from '../components/SoundStyleSheet';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ty,
  hairline,
  tracking,
  Colors,
  AppearanceToggle,
} from '../theme';
import { boundedContent } from '../theme';
import { useFeedback } from '../feedback/FeedbackProvider';

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

type SoundEventKey = keyof Omit<SoundSettings, 'countdownDuration'>;

// Keys only — the visible label is resolved at render via t() so it stays
// translatable (canon § Translations: never resolve copy in a module constant).
const SOUND_EVENT_KEYS: SoundEventKey[] = [
  'warmUpStart',
  'workStart',
  'restStart',
  'recoveryStart',
  'coolDownStart',
  'workoutComplete',
  'halfwaySound',
];

export default function SettingsScreen({ navigation }: Props) {
  const { c } = useTheme();
  const { open: openFeedback } = useFeedback();
  const s = makeStyles(c);

  const [sounds, setSounds] = useState<SoundSettings>(DEFAULT_SETTINGS.sounds);
  const [audioMode, setAudioMode] = useState(DEFAULT_SETTINGS.audioAccessibilityMode);
  const [tipVisible, setTipVisible] = useState(false);
  /** Which event's sound-style sheet is open (hub-and-spoke — the settings
   *  row shows the current style; the sheet holds the full list). */
  const [soundSheetFor, setSoundSheetFor] = useState<SoundEventKey | null>(null);

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
    Alert.alert(t('settings.resetTitle'), t('settings.resetMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.reset'),
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
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
          style={({ pressed }) => [s.headerSide, pressed && s.pressed]}
        >
          <ChevronLeft size={22} color={c.fg} strokeWidth={1.5} />
          <Text style={s.headerBackText}>{t('common.back')}</Text>
        </Pressable>
        <Text style={s.headerTitle} accessibilityRole="header">{t('settings.title')}</Text>
        <Pressable
          onPress={handleReset}
          hitSlop={8}
          accessibilityLabel={t('settings.resetA11y')}
          accessibilityRole="button"
          accessibilityHint={t('settings.resetHint')}
          style={({ pressed }) => [s.headerSide, s.headerSideRight, pressed && s.pressed]}
        >
          <Text style={s.headerReset}>{t('settings.reset')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.appearance')}</Text>
        <AppearanceToggle
          style={{ paddingHorizontal: 0, marginBottom: space.s6 }}
          labels={{
            title: t('settings.appearance'),
            system: t('settings.themeSystem'),
            light: t('settings.themeLight'),
            dark: t('settings.themeDark'),
          }}
        />

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.language')}</Text>
        <View style={{ marginBottom: space.s6 }}>
          <LanguageSetting />
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.accessibility')}</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLabel} importantForAccessibility="no-hide-descendants">
              <Text style={s.rowTitle}>{t('settings.voiceCues')}</Text>
              <Text style={s.rowHint}>{t('settings.voiceCuesHint')}</Text>
            </View>
            <Switch
              value={audioMode}
              onValueChange={updateAudioMode}
              trackColor={{ false: c.hairlineStrong, true: c.fg }}
              thumbColor={c.bgElevated}
              ios_backgroundColor={c.hairlineStrong}
              accessibilityRole="switch"
              accessibilityLabel={t('settings.voiceCues')}
              accessibilityState={{ checked: audioMode }}
            />
          </View>
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.countdown')}</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View
              style={s.rowLabel}
              accessible
              accessibilityRole="text"
              accessibilityLabel={t('settings.countdownDurationA11y')}
            >
              <Text style={s.rowTitle} importantForAccessibility="no">{t('settings.countdownDuration')}</Text>
              <Text style={s.rowHint} importantForAccessibility="no">{t('settings.countdownDurationHint')}</Text>
            </View>
            <View
              style={s.stepper}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={
                sounds.countdownDuration === 0
                  ? t('common.off')
                  : `${sounds.countdownDuration} second${sounds.countdownDuration !== 1 ? 's' : ''}`
              }
              accessibilityHint={t('settings.swipeHint')}
              accessibilityActions={[
                { name: 'increment', label: t('a11y.increase') },
                { name: 'decrement', label: t('a11y.decrease') },
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

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.sounds')}</Text>
        <View style={s.card}>
          {/* One summary row per event (hub-and-spoke) — the full style list
              lives in the SoundStyleSheet, where every option fits full-width
              instead of a horizontally-clipped pill strip. */}
          {SOUND_EVENT_KEYS.map((eventKey) => (
            <DrilldownRow
              key={eventKey}
              label={t(`settings.soundEvents.${eventKey}`)}
              value={SOUND_STYLE_LABELS[sounds[eventKey]]}
              onPress={() => setSoundSheetFor(eventKey)}
            />
          ))}
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.about')}</Text>
        <AboutSection
          onSupport={() => setTipVisible(true)}
          onFeedback={() => openFeedback()}
          onAcknowledgements={() => navigation.navigate('Acknowledgements')}
        />
      </ScrollView>
      {tipVisible && (
        <TipJarSheet
          visible
          onDismiss={() => setTipVisible(false)}
          productIds={TIP_PRODUCT_IDS}
        />
      )}
      <SoundStyleSheet
        visible={soundSheetFor != null}
        eventLabel={soundSheetFor ? t(`settings.soundEvents.${soundSheetFor}`) : ''}
        value={soundSheetFor ? sounds[soundSheetFor] : 'none'}
        onClose={() => setSoundSheetFor(null)}
        onPick={(style) => {
          if (soundSheetFor) updateSound(soundSheetFor, style);
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      ...boundedContent,
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
    headerBackText: { ...ty.base, color: c.fg, fontFamily: fontFamily.sans },
    headerTitle: {
      ...ty.base,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
      textAlign: 'center',
    },
    headerReset: { ...ty.sm, color: c.danger, fontFamily: fontFamily.sansMedium },

    scroll: { ...boundedContent, padding: space.s5, paddingBottom: space.s8 },
    sectionHeader: {
      ...ty.xs,
      fontFamily: fontFamily.sansMedium,
      color: c.fgMuted,
      letterSpacing: tracking.wide,
      textTransform: 'uppercase',
      marginBottom: space.s3,
      marginTop: space.s3,
      paddingHorizontal: space.s1,
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
    rowTitle: { ...ty.sm, color: c.fg, fontFamily: fontFamily.sansMedium },
    rowHint: { ...ty.xs, color: c.fgMuted, fontFamily: fontFamily.sans, marginTop: 2 },
    rowValue: { ...ty.sm, color: c.fgMuted, fontFamily: fontFamily.mono },

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
      ...ty.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      minWidth: 36,
      textAlign: 'center',
    },
  });
}
