import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Application from 'expo-application';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ChevronLeft,
  ChevronRight,
  HandHeart,
  Code,
  Library,
  Mail,
  Minus,
  Plus,
  Shield,
  Star,
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
import { TIP_JAR_ENABLED } from '../constants/features';
import { TIP_PRODUCT_IDS } from '../constants/tipProducts';
import TipJarSheet from '../components/TipJarSheet';
import { AudioEngine } from '../audio/AudioEngine';
import { t } from '../i18n';
import Wordmark from '../components/Wordmark';
import { LanguageSetting } from '../components/LanguageSetting';
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

const APP_STORE_ID = '6767314178';
const ANDROID_PACKAGE_NAME = 'com.joshapproved.freeworkouttimer';
const GITHUB_REPO_URL = 'https://github.com/Josh-Approved/workout-timer';
const PRIVACY_URL = `${GITHUB_REPO_URL}/blob/main/PRIVACY.md`;

const reviewUrl =
  Platform.OS === 'ios'
    ? `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`
    : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}&showAllReviews=true`;

function formatVersion(): string {
  const version = Application.nativeApplicationVersion ?? '—';
  const build = Application.nativeBuildVersion;
  return build ? `${version} (${build})` : version;
}

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
        <Text style={s.sectionHint}>{t('settings.soundsHint')}</Text>
        <View style={s.card}>
          {SOUND_EVENT_KEYS.map((eventKey, idx) => {
            const eventLabel = t(`settings.soundEvents.${eventKey}`);
            return (
            <View key={eventKey} style={[s.soundRow, idx > 0 && s.soundRowBorder]}>
              <Text style={s.soundEventLabel}>{eventLabel}</Text>
              {/* There are 9+ sound styles — more than fit a phone width, so
                  this row scrolls horizontally. Keep the scroll indicator on
                  so the affordance is visible: without it the last chip is
                  clipped flush at the screen edge and reads as an unreachable,
                  broken option rather than a scrollable list. */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={s.pillRow}
                accessibilityRole="radiogroup"
                accessibilityLabel={t('settings.soundEventA11y', { label: eventLabel })}
              >
                {ALL_SOUND_STYLES.map((style) => {
                  const active = sounds[eventKey] === style;
                  return (
                    <Pressable
                      key={style}
                      style={({ pressed }) => [
                        s.pill,
                        active && s.pillActive,
                        pressed && s.pressed,
                      ]}
                      onPress={() => updateSound(eventKey, style)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={SOUND_STYLE_LABELS[style]}
                      accessibilityHint={active ? t('settings.soundSelected') : t('settings.soundSelectHint')}
                    >
                      <Text style={[s.pillText, active && s.pillTextActive]} importantForAccessibility="no">
                        {SOUND_STYLE_LABELS[style]}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            );
          })}
        </View>

        <Text style={s.sectionHeader} accessibilityRole="header">{t('settings.about')}</Text>
        <View style={s.card}>
          {TIP_JAR_ENABLED && (
            <Pressable
              style={({ pressed }) => [s.aboutRow, pressed && s.pressed]}
              onPress={() => setTipVisible(true)}
              accessibilityLabel={t('about.support')}
              accessibilityRole="button"
            >
              <HandHeart size={20} color={c.fg} strokeWidth={1.5} />
              <Text style={s.aboutRowLabel}>{t('about.support')}</Text>
              <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [s.aboutRow, s.aboutRowBorder, pressed && s.pressed]}
            onPress={() => openFeedback()}
            accessibilityLabel={t('about.feedback')}
            accessibilityRole="link"
            accessibilityHint={t('a11y.feedbackHint')}
          >
            <Mail size={20} color={c.fg} strokeWidth={1.5} />
            <Text style={s.aboutRowLabel}>{t('about.feedback')}</Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.aboutRow, s.aboutRowBorder, pressed && s.pressed]}
            onPress={() => Linking.openURL(reviewUrl).catch(() => {})}
            accessibilityLabel={t('about.review')}
            accessibilityRole="link"
            accessibilityHint={t('settings.reviewHint')}
          >
            <Star size={20} color={c.fg} strokeWidth={1.5} />
            <Text style={s.aboutRowLabel}>{t('about.review')}</Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.aboutRow, s.aboutRowBorder, pressed && s.pressed]}
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            accessibilityLabel={t('about.privacy')}
            accessibilityRole="link"
            accessibilityHint={t('settings.privacyHint')}
          >
            <Shield size={20} color={c.fg} strokeWidth={1.5} />
            <Text style={s.aboutRowLabel}>{t('about.privacy')}</Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.aboutRow, s.aboutRowBorder, pressed && s.pressed]}
            onPress={() => Linking.openURL(GITHUB_REPO_URL).catch(() => {})}
            accessibilityLabel={t('about.source')}
            accessibilityRole="link"
            accessibilityHint={t('settings.sourceHint')}
          >
            <Code size={20} color={c.fg} strokeWidth={1.5} />
            <Text style={s.aboutRowLabel}>{t('about.source')}</Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.aboutRow, s.aboutRowBorder, pressed && s.pressed]}
            onPress={() => navigation.navigate('Acknowledgements')}
            accessibilityLabel={t('about.acknowledgements')}
            accessibilityRole="button"
            accessibilityHint={t('settings.acknowledgementsHint')}
          >
            <Library size={20} color={c.fg} strokeWidth={1.5} />
            <Text style={s.aboutRowLabel}>{t('about.acknowledgements')}</Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} />
          </Pressable>
          <View
            style={[s.aboutRow, s.aboutRowBorder]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={t('settings.versionA11y', { version: formatVersion() })}
          >
            <View style={s.aboutRowIconSpacer} importantForAccessibility="no" />
            <Text style={s.aboutRowLabel} importantForAccessibility="no">{t('about.version')}</Text>
            <Text style={s.versionValue} importantForAccessibility="no">{formatVersion()}</Text>
          </View>
        </View>

        <View style={s.stamp}>
          <Wordmark />
          <Text style={s.stampText}>
            {t('about.oneLiner')}
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://joshapproved.com').catch(() => {})}
            hitSlop={8}
            accessibilityLabel={t('settings.learnMoreA11y')}
            accessibilityRole="link"
            accessibilityHint={t('settings.learnMoreHint')}
            style={({ pressed }) => pressed && s.pressed}
          >
            <Text style={s.stampLink}>{t('about.learnMore')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      {tipVisible && (
        <TipJarSheet
          visible
          onDismiss={() => setTipVisible(false)}
          productIds={TIP_PRODUCT_IDS}
        />
      )}
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
    sectionHint: {
      ...ty.xs,
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
    rowTitle: { ...ty.sm, color: c.fg, fontFamily: fontFamily.sansMedium },
    rowHint: { ...ty.xs, color: c.fgMuted, fontFamily: fontFamily.sans, marginTop: 2 },
    rowValue: { ...ty.sm, color: c.fgMuted, fontFamily: fontFamily.mono },

    aboutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s4,
      minHeight: 48,
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
      backgroundColor: c.bgElevated,
    },
    aboutRowBorder: {
      borderTopWidth: hairline,
      borderTopColor: c.hairline,
    },
    aboutRowLabel: {
      ...ty.sm,
      color: c.fg,
      fontFamily: fontFamily.sansMedium,
      flex: 1,
    },
    aboutRowIconSpacer: { width: 20 },
    versionValue: {
      ...ty.sm,
      color: c.fgMuted,
      fontFamily: fontFamily.mono,
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
      ...ty.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      minWidth: 36,
      textAlign: 'center',
    },

    soundRow: { paddingHorizontal: space.s5, paddingVertical: space.s4 },
    soundRowBorder: { borderTopWidth: hairline, borderTopColor: c.hairline },
    soundEventLabel: {
      ...ty.sm,
      fontFamily: fontFamily.sansMedium,
      color: c.fg,
      marginBottom: space.s3,
    },
    // paddingRight gives the row trailing breathing room so the last chip
    // never ends flush against the screen edge (which read as a clipped,
    // broken option); combined with the visible scroll indicator it reads
    // as an intentionally scrollable list.
    pillRow: { flexDirection: 'row', gap: space.s2, paddingRight: space.s5 },
    pill: {
      paddingHorizontal: space.s4,
      paddingVertical: space.s2,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairlineStrong,
      backgroundColor: c.bg,
    },
    pillActive: { backgroundColor: c.fg, borderColor: c.fg },
    pillText: { ...ty.sm, color: c.fg, fontFamily: fontFamily.sans },
    pillTextActive: { color: c.bg, fontFamily: fontFamily.sansMedium },

    stamp: { alignItems: 'center', paddingVertical: space.s5, gap: space.s3 },
    stampText: {
      ...ty.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
      textAlign: 'center',
      paddingHorizontal: space.s6,
    },
    stampLink: {
      ...ty.xs,
      color: c.fg,
      fontFamily: fontFamily.sansMedium,
      textDecorationLine: 'underline',
      textDecorationColor: c.hairlineStrong,
    },
  });
}
