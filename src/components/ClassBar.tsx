/**
 * The class strip at the top of a class workout: that this is a class (and a
 * beta), whether the relay is reachable, what the instructor's next command
 * is about to do, and the two actions any phone has: show the class code, and
 * send feedback about the beta.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { QrCode, MessageSquare } from 'lucide-react-native';
import { t } from '../i18n';
import type { ClassView } from '../screens/useWorkoutPlayback';
import { BetaChip } from './BetaChip';
import { useTheme, fontFamily, space, type as ty, target, Colors } from '../theme';

type Props = {
  view: ClassView;
  onShowCode: () => void;
  onFeedback: () => void;
};

export function ClassBar({ view, onShowCode, onFeedback }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);

  const pending = view.pending
    ? view.pending.action === 'pause'
      ? t('classMode.pausing')
      : view.pending.action === 'resume'
        ? t('classMode.resumingIn', { seconds: view.pending.inSec })
        : t('classMode.moving')
    : null;
  const notice = view.steppedOut
    ? t('classMode.steppedOut')
    : !view.live && view.startsIn == null
      ? t(view.role === 'host' ? 'classMode.offlineHost' : 'classMode.offlineMember')
      : null;

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <View style={s.left}>
          <Text style={s.label}>{t(view.role === 'host' ? 'classMode.instructor' : 'classMode.title')}</Text>
          <BetaChip />
          {view.live ? <Text style={s.live}>{`· ${t('classMode.live')}`}</Text> : null}
        </View>
        <Pressable
          onPress={onFeedback}
          hitSlop={8}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('classMode.sendFeedback')}
        >
          <MessageSquare size={20} color={c.fg} strokeWidth={1.5} />
        </Pressable>
        <Pressable
          onPress={onShowCode}
          hitSlop={8}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('classMode.showCode')}
        >
          <QrCode size={22} color={c.fg} strokeWidth={1.5} />
        </Pressable>
      </View>
      {pending || notice ? (
        <Text style={[s.notice, pending ? s.pending : null]} accessibilityLiveRegion="polite">
          {pending ?? notice}
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: { alignSelf: 'stretch', paddingHorizontal: space.s5, gap: space.s2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
    left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s3 },
    label: { ...ty.sm, fontFamily: fontFamily.sansSemibold, color: c.fg },
    live: { ...ty.sm, fontFamily: fontFamily.sans, color: c.success },
    iconBtn: { width: target.min, height: target.min, alignItems: 'center', justifyContent: 'center' },
    notice: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center' },
    pending: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.fg },
    pressed: { opacity: 0.7 },
  });
}
