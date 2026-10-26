/**
 * The one-time class mode beta note: what to expect, how it works, and where
 * to say so if it slips. One action.
 */

import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { t } from '../i18n';
import { BetaChip } from './BetaChip';
import { useTheme, fontFamily, space, radius, type as ty, hairline, Colors } from '../theme';

export function ClassBetaSheet({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={s.overlay}>
        <View style={s.card} accessibilityViewIsModal>
          <BetaChip />
          <Text style={s.title} accessibilityRole="header">
            {t('classMode.betaTitle')}
          </Text>
          <Text style={s.body}>{t('classMode.betaBody')}</Text>
          <Text style={s.body}>{t('classMode.howItWorks')}</Text>
          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.gotIt')}
          >
            <Text style={s.primaryBtnText}>{t('common.gotIt')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: c.bgScrim,
      justifyContent: 'center',
      alignItems: 'center',
      padding: space.s6,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.bgElevated,
      borderRadius: radius.lg,
      borderWidth: hairline,
      borderColor: c.hairline,
      padding: space.s6,
      alignItems: 'center',
      gap: space.s4,
    },
    title: { ...ty.md, fontFamily: fontFamily.sansSemibold, color: c.fg, textAlign: 'center' },
    body: { ...ty.sm, fontFamily: fontFamily.sans, color: c.fgMuted, textAlign: 'center' },
    primaryBtn: {
      alignSelf: 'stretch',
      backgroundColor: c.inkButton,
      paddingVertical: space.s4,
      borderRadius: radius.pill,
      alignItems: 'center',
      marginTop: space.s3,
    },
    primaryBtnText: { ...ty.base, fontFamily: fontFamily.sansSemibold, color: c.inkButtonText },
    pressed: { opacity: 0.7 },
  });
}
