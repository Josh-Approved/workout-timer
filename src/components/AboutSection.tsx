/**
 * The Settings "About" card (support / feedback / review / privacy / source /
 * acknowledgements / version) plus the josh-approved stamp beneath it.
 * Extracted from SettingsScreen; the rows that open in-app surfaces (tip jar,
 * feedback sheet, acknowledgements) are handed up as callbacks, the external
 * links live here with the store/repo constants they point at.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import {
  ChevronRight,
  HandHeart,
  Code,
  Library,
  Mail,
  Shield,
  Star,
} from 'lucide-react-native';
import { TIP_JAR_ENABLED } from '../constants/features';
import { t } from '../i18n';
import { Wordmark } from './Wordmark';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ty,
  hairline,
  Colors,
} from '../theme';

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

type Props = {
  onSupport: () => void;
  onFeedback: () => void;
  onAcknowledgements: () => void;
};

export function AboutSection({ onSupport, onFeedback, onAcknowledgements }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

  return (
    <>
      <View style={s.card}>
        {TIP_JAR_ENABLED && (
          <Pressable
            style={({ pressed }) => [s.aboutRow, pressed && s.pressed]}
            onPress={onSupport}
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
          onPress={onFeedback}
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
          onPress={onAcknowledgements}
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
    </>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pressed: { opacity: 0.7 },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: space.s6,
      overflow: 'hidden',
    },
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
