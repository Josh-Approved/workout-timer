/**
 * The class code, full screen: a QR code redrawn every tenth of a second with
 * the class time, which is what lines a scanning phone up with the class
 * (class/clockSync). Any phone in the class can show it, so a late arrival
 * never has to find the instructor. Kept bright and high-contrast in both
 * themes: a camera reads black on white best.
 */

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { t } from '../i18n';
import { formatTime, formatDurationSpoken } from '../utils/workout';
import { BetaChip } from './BetaChip';
import { useTheme, fontFamily, space, radius, type as ty, Colors } from '../theme';

/** How often the code is redrawn with a fresh class time. */
const REDRAW_MS = 100;

type Props = {
  visible: boolean;
  /** The code to draw right now (class time baked in). */
  code: () => string | null;
  workoutName: string;
  startsIn: number | null;
  onDismiss: () => void;
};

export function ClassCodeSheet({ visible, code, workoutName, startsIn, onDismiss }: Props) {
  const { c } = useTheme();
  const s = makeStyles(c);
  const { width, height } = useWindowDimensions();
  const size = Math.min(width - space.s7 * 2, height * 0.5, 360);
  const [value, setValue] = useState<string | null>(() => code());

  useEffect(() => {
    if (!visible) return;
    setValue(code());
    const id = setInterval(() => setValue(code()), REDRAW_MS);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onDismiss}>
      <View style={s.screen}>
        <View style={s.header}>
          <Text style={s.title} accessibilityRole="header">
            {t('classMode.codeTitle')}
          </Text>
          <BetaChip />
        </View>
        <Text style={s.name} numberOfLines={2}>
          {workoutName}
        </Text>
        <View
          style={s.qrWrap}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t('classMode.codeA11y', { name: workoutName })}
        >
          {value ? <QRCode value={value} size={size} backgroundColor="#FFFFFF" color="#000000" ecl="L" /> : null}
        </View>
        <Text
          style={s.status}
          accessibilityLiveRegion="polite"
          accessibilityLabel={
            startsIn != null
              ? t('classMode.startsInA11y', { time: formatDurationSpoken(startsIn) })
              : t('classMode.running')
          }
        >
          {startsIn != null ? `${t('classMode.classStartsIn')} ${formatTime(startsIn)}` : t('classMode.running')}
        </Text>
        <Text style={s.body}>{t('classMode.codeBody')}</Text>
        <Pressable
          style={({ pressed }) => [s.doneBtn, pressed && s.pressed]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={t('classMode.done')}
        >
          <Text style={s.doneText}>{t('classMode.done')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space.s6,
      gap: space.s4,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
    title: { ...ty.lg, fontFamily: fontFamily.sansSemibold, color: c.fg },
    name: { ...ty.base, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center' },
    qrWrap: { padding: space.s5, backgroundColor: '#FFFFFF', borderRadius: radius.lg },
    status: {
      ...ty.md,
      fontFamily: fontFamily.mono,
      color: c.fg,
      fontVariant: ['tabular-nums'],
    },
    body: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center', maxWidth: 360 },
    doneBtn: {
      backgroundColor: c.inkButton,
      paddingHorizontal: space.s7,
      paddingVertical: space.s4,
      borderRadius: radius.pill,
      marginTop: space.s3,
    },
    doneText: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.inkButtonText },
    pressed: { opacity: 0.7 },
  });
}
