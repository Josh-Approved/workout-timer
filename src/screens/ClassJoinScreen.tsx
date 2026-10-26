/**
 * Join a class by scanning its code. The scanner keeps reading for a second or
 * so, because each read is one clock sample: the class time the code showed,
 * against this phone's clock when it arrived (class/clockSync). Once there are
 * enough, the phone is lined up and the class opens, already at the right
 * point if it has started.
 *
 * The camera is asked for here, when the person chooses to scan, never before.
 * Nothing the camera sees is saved or sent.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { nowMs, prepareLiveTimer } from 'live-timer';
import { RootStackParamList } from '../types';
import { parseClassCode, wallOffsetOf, type ClassInvite } from '../class/classCode';
import { estimateOffset, linedUp, MIN_READS, type ClockRead } from '../class/clockSync';
import { memberSession, MAX_CLASS_MS, type ClassSession } from '../class/session';
import { ScreenHeader } from '../components/ScreenHeader';
import { BetaChip } from '../components/BetaChip';
import { logEvent } from '../feedback/log';
import { t } from '../i18n';
import { useTheme, fontFamily, space, radius, type as ty, Colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ClassJoin'>;

type Status = 'scanning' | 'liningUp' | 'notACode' | 'classOver';

// A code alone can't say whether its class is over (the instructor may have
// paused it past its planned end), so only a class past any plausible length
// is refused here; one that has truly finished opens on its done screen.
function openClass(invite: ClassInvite, inviteCode: string, offsetMs: number): ClassSession | null {
  if (nowMs() + offsetMs > invite.startAt + MAX_CLASS_MS) return null;
  return memberSession(invite, inviteCode, offsetMs, nowMs(), Date.now());
}

export default function ClassJoinScreen({ route, navigation }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>('scanning');
  const [progress, setProgress] = useState(0);
  const reads = useRef<ClockRead[]>([]);
  const current = useRef<{ invite: ClassInvite; inviteCode: string } | null>(null);
  const done = useRef(false);

  const join = (session: ClassSession | null) => {
    if (!session) {
      setStatus('classOver');
      return;
    }
    done.current = true;
    navigation.replace('ActiveWorkout', { classSession: session });
  };

  // However the scanner was reached (a link from outside the app included),
  // the on-screen timer's permission is settled before the class runs.
  useEffect(() => {
    prepareLiveTimer().catch(() => {});
  }, []);

  // Development builds join straight from a tapped/opened link, lining up by
  // time of day (simulators share the host's clock). Store builds scan.
  useEffect(() => {
    const link = route.params?.link;
    if (!__DEV__ || !link) return;
    const parsed = parseClassCode(link);
    const wallOffset = parsed && wallOffsetOf(parsed.classNow, parsed.wallNow);
    if (!parsed || wallOffset == null) return;
    join(openClass(parsed.invite, parsed.inviteCode, wallOffset + Date.now() - nowMs()));
  }, [route.params?.link]);

  const onScanned = ({ data }: { data: string }) => {
    const localNow = nowMs(); // first: every millisecond after this is error
    if (done.current) return;
    const parsed = parseClassCode(data);
    if (!parsed) {
      setStatus('notACode');
      return;
    }
    if (current.current?.inviteCode !== parsed.inviteCode) {
      current.current = { invite: parsed.invite, inviteCode: parsed.inviteCode };
      reads.current = [];
    }
    if (parsed.classNow == null) return;
    reads.current.push({ classNow: parsed.classNow, localNow });
    setStatus('liningUp');
    setProgress(Math.min(1, new Set(reads.current.map((r) => r.classNow)).size / MIN_READS));
    if (!linedUp(reads.current)) return;
    const offset = estimateOffset(reads.current)!;
    logEvent('class', 'joined a class', { reads: reads.current.length });
    join(openClass(parsed.invite, parsed.inviteCode, offset));
  };

  const message =
    status === 'liningUp'
      ? t('classMode.liningUp')
      : status === 'notACode'
        ? t('classMode.notAClassCode')
        : status === 'classOver'
          ? t('classMode.classOver')
          : t('classMode.scanHint');

  return (
    <SafeAreaView style={s.container}>
      <ScreenHeader title={t('classMode.joinTitle')} onBack={() => navigation.goBack()} right={<BetaChip />} />
      {!permission ? null : !permission.granted ? (
        <View style={s.ask}>
          <Text style={s.body}>{t('classMode.cameraNeeded')}</Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
            accessibilityRole="button"
            accessibilityLabel={t(permission.canAskAgain ? 'classMode.allowCamera' : 'classMode.openSettings')}
          >
            <Text style={s.primaryBtnText}>
              {t(permission.canAskAgain ? 'classMode.allowCamera' : 'classMode.openSettings')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={s.scan}>
          <View style={s.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
          </View>
          <View style={s.bar} accessibilityElementsHidden importantForAccessibility="no">
            <View style={[s.barFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Text style={s.body} accessibilityLiveRegion="polite">
            {message}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    ask: { flex: 1, padding: space.s6, justifyContent: 'center', gap: space.s5 },
    scan: { flex: 1, padding: space.s5, gap: space.s5, alignItems: 'center' },
    cameraFrame: {
      width: '100%',
      aspectRatio: 1,
      maxWidth: 420,
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: '#000000',
    },
    bar: { width: '100%', maxWidth: 420, height: 6, borderRadius: radius.pill, backgroundColor: c.bgSubtle },
    barFill: { height: 6, borderRadius: radius.pill, backgroundColor: c.success },
    body: { ...ty.base, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center' },
    primaryBtn: {
      alignItems: 'center',
      backgroundColor: c.inkButton,
      paddingVertical: space.s4,
      borderRadius: radius.pill,
    },
    primaryBtnText: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.inkButtonText },
    pressed: { opacity: 0.7 },
  });
}
