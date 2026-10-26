/**
 * Class mode's front door (beta): join a class by scanning, or run one of your
 * timers as a class. Running one makes the class (its keys, its start time)
 * and opens the workout with the class code up, so the room can scan in while
 * the start counts down.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, ScanLine } from 'lucide-react-native';
import { nowMs, prepareLiveTimer } from 'live-timer';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers } from '../storage/storage';
import { getTimerSummary } from '../utils/workout';
import { hostSession } from '../class/session';
import { classBetaSeen, markClassBetaSeen } from '../class/betaNotice';
import { ScreenHeader } from '../components/ScreenHeader';
import { OptionChips } from '../components/OptionChips';
import { BetaChip } from '../components/BetaChip';
import { ClassBetaSheet } from '../components/ClassBetaSheet';
import { useFeedback } from '../feedback/FeedbackProvider';
import { logEvent } from '../feedback/log';
import { t } from '../i18n';
import { useTheme, fontFamily, space, radius, type as ty, hairline, boundedContent, Colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Class'>;

const START_IN: Record<string, number> = { s30: 30_000, m1: 60_000, m2: 120_000 };

export default function ClassScreen({ navigation }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  const feedback = useFeedback();
  const [timers, setTimers] = useState<TimerConfig[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [startIn, setStartIn] = useState('m1');
  const [betaVisible, setBetaVisible] = useState(false);
  const [tooLong, setTooLong] = useState(false);

  useEffect(() => {
    loadTimers().then((list) => {
      setTimers(list);
      setPicked((p) => p ?? list[0]?.id ?? null);
    });
    classBetaSeen().then((seen) => {
      if (!seen) setBetaVisible(true);
    });
  }, []);

  // The on-screen timer's permission (Android notifications) is asked here,
  // as the class is set up, so it never lands on top of the class starting.
  const startClass = async () => {
    const timer = timers.find((tt) => tt.id === picked);
    if (!timer) return;
    await prepareLiveTimer();
    const session = hostSession(timer, START_IN[startIn], nowMs(), Date.now());
    if (!session) {
      setTooLong(true);
      return;
    }
    logEvent('class', 'started a class', { startInMs: START_IN[startIn], kind: timer.kind ?? 'intervals' });
    navigation.replace('ActiveWorkout', { classSession: session, showCode: true });
  };

  const scan = async () => {
    await prepareLiveTimer();
    navigation.navigate('ClassJoin', {});
  };

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title={t('classMode.title')} onBack={() => navigation.goBack()} right={<BetaChip />} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.cardTitle} accessibilityRole="header">
            {t('classMode.joinTitle')}
          </Text>
          <Text style={s.body}>{t('classMode.joinBody')}</Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={scan}
            accessibilityRole="button"
            accessibilityLabel={t('classMode.joinCta')}
          >
            <ScanLine size={20} color={c.inkButtonText} strokeWidth={1.75} />
            <Text style={s.primaryBtnText}>{t('classMode.joinCta')}</Text>
          </Pressable>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle} accessibilityRole="header">
            {t('classMode.runTitle')}
          </Text>
          <Text style={s.body}>{t('classMode.runBody')}</Text>
          {timers.length === 0 ? (
            <Text style={s.body}>{t('classMode.noTimers')}</Text>
          ) : (
            <>
              <Text style={s.label}>{t('classMode.pickTimer')}</Text>
              <View style={s.list} accessibilityRole="radiogroup">
                {timers.map((tt) => {
                  const on = tt.id === picked;
                  return (
                    <Pressable
                      key={tt.id}
                      onPress={() => {
                        setPicked(tt.id);
                        setTooLong(false);
                      }}
                      style={({ pressed }) => [s.row, pressed && s.pressed]}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${tt.name}, ${getTimerSummary(tt)}`}
                    >
                      <View style={s.rowText} importantForAccessibility="no">
                        <Text style={s.rowName}>{tt.name}</Text>
                        <Text style={s.rowSummary}>{getTimerSummary(tt)}</Text>
                      </View>
                      {on ? <Check size={20} color={c.fg} strokeWidth={2} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.label}>{t('classMode.startsInLabel')}</Text>
              <OptionChips
                options={[
                  { key: 's30', label: t('classMode.startIn30s') },
                  { key: 'm1', label: t('classMode.startIn1m') },
                  { key: 'm2', label: t('classMode.startIn2m') },
                ]}
                selectedKey={startIn}
                onPick={setStartIn}
              />
              {tooLong ? (
                <Text style={s.warning} accessibilityLiveRegion="polite">
                  {t('classMode.tooLong')}
                </Text>
              ) : null}
              <Pressable
                style={({ pressed }) => [s.primaryBtn, pressed && s.pressed, !picked && s.disabled]}
                onPress={startClass}
                disabled={!picked}
                accessibilityRole="button"
                accessibilityLabel={t('classMode.startClass')}
              >
                <Text style={s.primaryBtnText}>{t('classMode.startClass')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={s.footnote}>{t('classMode.howItWorks')}</Text>
        <Pressable
          onPress={() => feedback.open('bug')}
          style={({ pressed }) => [s.link, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('classMode.sendFeedback')}
        >
          <Text style={s.linkText}>{t('classMode.sendFeedback')}</Text>
        </Pressable>
      </ScrollView>
      <ClassBetaSheet
        visible={betaVisible}
        onDismiss={() => {
          setBetaVisible(false);
          markClassBetaSeen();
        }}
      />
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    content: { ...boundedContent, padding: space.s5, gap: space.s5, paddingBottom: space.s8 },
    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.lg,
      borderWidth: hairline,
      borderColor: c.hairline,
      padding: space.s5,
      gap: space.s4,
    },
    cardTitle: { ...ty.md, fontFamily: fontFamily.sansSemibold, color: c.fg },
    body: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted },
    label: { ...ty.sm, fontFamily: fontFamily.sansSemibold, color: c.fg },
    list: { borderRadius: radius.md, borderWidth: hairline, borderColor: c.hairline, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: space.s4,
      paddingVertical: space.s4,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
      gap: space.s3,
      minHeight: 44,
    },
    rowText: { flex: 1 },
    rowName: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.fg },
    rowSummary: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted },
    primaryBtn: {
      flexDirection: 'row',
      gap: space.s3,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.inkButton,
      paddingVertical: space.s4,
      borderRadius: radius.pill,
    },
    primaryBtnText: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.inkButtonText },
    disabled: { opacity: 0.4 },
    warning: { ...ty.sm, fontFamily: fontFamily.sans, color: c.warning },
    footnote: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center' },
    link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: space.s4 },
    linkText: { ...ty.sm, fontFamily: fontFamily.sansSemibold, color: c.fg, textDecorationLine: 'underline' },
    pressed: { opacity: 0.7 },
  });
}
