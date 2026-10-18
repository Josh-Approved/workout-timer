/**
 * The interval list of a custom-sequence timer, inside the editor: one row
 * per interval (name, kind, length) that opens a focused pane to edit it, and
 * an "Add interval" row. Reordering and removal live in the pane as plain
 * labelled buttons, so every action is reachable by touch, VoiceOver,
 * TalkBack and Voice Control alike on both platforms (no drag-only paths).
 *
 * The pane is a DrilldownSheet, which must sit at the SCREEN root — so this
 * component renders only the rows, and exports the pane separately for the
 * screen to place as a sibling of its scroll view.
 */

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { SequenceInterval, IntervalKind } from '../types';
import { formatSliderValue, spokenSliderValue, SliderField, FINE_SECONDS_BELOW } from './SliderField';
import { OptionChips } from './OptionChips';
import { DrilldownSheet } from './DrilldownSheet';
import { t } from '../i18n';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ty,
  hairline,
  target,
  tracking,
  Colors,
} from '../theme';

type ListProps = {
  intervals: SequenceInterval[];
  onOpen: (id: string) => void;
  onAdd: () => void;
};

const kindLabel = (kind: IntervalKind) => t(kind === 'rest' ? 'editor.kindRest' : 'editor.kindWork');

export function SequenceIntervalsList({ intervals, onOpen, onAdd }: ListProps) {
  const { c } = useTheme();
  const s = makeStyles(c);
  return (
    <View style={s.body}>
      {intervals.length === 0 ? (
        <Text style={s.empty}>{t('editor.sequenceEmpty')}</Text>
      ) : null}
      {intervals.map((iv, i) => {
        const name = iv.name.trim() || t('editor.intervalTitle');
        const { display, unit } = formatSliderValue(iv.duration, true);
        return (
          <Pressable
            key={iv.id}
            style={({ pressed }) => [s.row, i > 0 && s.rowBorder, pressed && s.pressed]}
            onPress={() => onOpen(iv.id)}
            accessibilityRole="button"
            accessibilityLabel={t('editor.editInterval', { name })}
            accessibilityValue={{
              text: t('editor.intervalA11y', {
                name,
                kind: kindLabel(iv.kind),
                duration: spokenSliderValue(iv.duration, true),
              }),
            }}
            accessibilityHint={t('editor.editIntervalHint')}
          >
            <Text style={s.rowIndex} importantForAccessibility="no">{i + 1}</Text>
            <View style={s.rowText} importantForAccessibility="no">
              <Text style={s.rowName} numberOfLines={1}>{name}</Text>
              <Text style={s.rowMeta}>{kindLabel(iv.kind)}</Text>
            </View>
            <Text style={s.rowDuration} importantForAccessibility="no">
              {display}
              {unit ? <Text style={s.rowUnit}>{unit}</Text> : null}
            </Text>
            <ChevronRight size={18} color={c.fgMuted} strokeWidth={1.5} importantForAccessibility="no" />
          </Pressable>
        );
      })}
      <Pressable
        style={({ pressed }) => [s.row, intervals.length > 0 && s.rowBorder, pressed && s.pressed]}
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={t('editor.addInterval')}
        accessibilityHint={t('editor.addIntervalHint')}
      >
        <View style={s.addIcon} importantForAccessibility="no">
          <Plus size={18} color={c.fg} strokeWidth={1.75} />
        </View>
        <Text style={[s.rowName, s.addText]} importantForAccessibility="no">{t('editor.addInterval')}</Text>
      </Pressable>
    </View>
  );
}

type PaneProps = {
  interval: SequenceInterval | null;
  /** Position in the list, for the move buttons. */
  index: number;
  count: number;
  onChange: (next: SequenceInterval) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onClose: () => void;
};

/** The focused editor for one interval. Render at the screen root. */
export function SequenceIntervalPane({ interval, index, count, onChange, onMove, onRemove, onClose }: PaneProps) {
  const { c } = useTheme();
  const s = makeStyles(c);
  // Keep the last interval through the slide-out so the pane doesn't blank.
  const [last, setLast] = useState<SequenceInterval | null>(interval);
  if (interval && interval !== last) setLast(interval);
  const iv = interval ?? last;
  if (!iv) return null;
  const visible = interval != null;

  return (
    <DrilldownSheet visible={visible} title={t('editor.intervalTitle')} onClose={onClose}>
      <ScrollView contentContainerStyle={s.paneScroll} keyboardShouldPersistTaps="handled">
        <View style={s.section}>
          <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervalName')}</Text>
          <View style={s.body}>
            <TextInput
              style={s.nameInput}
              value={iv.name}
              onChangeText={(name) => onChange({ ...iv, name })}
              placeholder={t('editor.intervalNamePlaceholder')}
              placeholderTextColor={c.fgMuted}
              maxLength={40}
              returnKeyType="done"
              testID="interval-name-input"
              accessibilityLabel={t('editor.intervalName')}
              accessibilityHint={t('editor.intervalNameHint')}
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervalKind')}</Text>
          <OptionChips
            options={[
              { key: 'work', label: t('editor.kindWork') },
              { key: 'rest', label: t('editor.kindRest') },
            ]}
            selectedKey={iv.kind}
            onPick={(key) => onChange({ ...iv, kind: key === 'rest' ? 'rest' : 'work' })}
          />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervalDuration')}</Text>
          <View style={s.body}>
            <SliderField
              label={t('editor.intervalDuration')}
              hint={t('editor.intervalDurationHint')}
              value={iv.duration}
              onChange={(v) => onChange({ ...iv, duration: Math.max(1, v) })}
              min={1}
              max={600}
              step={5}
              fineBelow={FINE_SECONDS_BELOW}
              isTime
              colors={c}
            />
          </View>
        </View>

        <View style={s.paneActions}>
          <Pressable
            style={({ pressed }) => [s.actionBtn, index <= 0 && s.actionBtnDisabled, pressed && s.pressed]}
            onPress={() => onMove(-1)}
            disabled={index <= 0}
            accessibilityRole="button"
            accessibilityLabel={t('editor.moveIntervalUp')}
            accessibilityState={{ disabled: index <= 0 }}
          >
            <Text style={s.actionText}>{t('editor.moveIntervalUp')}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [s.actionBtn, index >= count - 1 && s.actionBtnDisabled, pressed && s.pressed]}
            onPress={() => onMove(1)}
            disabled={index >= count - 1}
            accessibilityRole="button"
            accessibilityLabel={t('editor.moveIntervalDown')}
            accessibilityState={{ disabled: index >= count - 1 }}
          >
            <Text style={s.actionText}>{t('editor.moveIntervalDown')}</Text>
          </Pressable>
        </View>
        <Pressable
          style={({ pressed }) => [s.actionBtn, s.removeBtn, pressed && s.pressed]}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('editor.removeInterval')}
        >
          <Text style={[s.actionText, s.removeText]}>{t('editor.removeInterval')}</Text>
        </Pressable>
      </ScrollView>
    </DrilldownSheet>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    pressed: { opacity: 0.7 },
    body: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      overflow: 'hidden',
    },
    empty: {
      ...ty.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      paddingHorizontal: space.s5,
      paddingTop: space.s4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      minHeight: target.min + 8,
      paddingHorizontal: space.s5,
      paddingVertical: space.s3,
    },
    rowBorder: { borderTopWidth: hairline, borderTopColor: c.hairline },
    rowIndex: {
      ...ty.xs,
      fontFamily: fontFamily.mono,
      color: c.fgMuted,
      width: 20,
      textAlign: 'right',
    },
    rowText: { flex: 1 },
    rowName: { ...ty.base, fontFamily: fontFamily.sans, color: c.fg },
    rowMeta: { ...ty.xs, fontFamily: fontFamily.sans, color: c.fgMuted },
    rowDuration: {
      ...ty.base,
      fontFamily: fontFamily.monoMedium,
      color: c.fg,
      fontVariant: ['tabular-nums'],
    },
    rowUnit: { ...ty.xs, fontFamily: fontFamily.mono, color: c.fgMuted },
    addIcon: { width: 20, alignItems: 'flex-end' },
    addText: { fontFamily: fontFamily.sansMedium },
    paneScroll: { padding: space.s5, paddingBottom: space.s8 },
    section: { marginBottom: space.s6 },
    sectionTitle: {
      ...ty.xs,
      fontFamily: fontFamily.sansMedium,
      color: c.fgMuted,
      letterSpacing: tracking.wide,
      textTransform: 'uppercase',
      marginBottom: space.s3,
      paddingHorizontal: space.s1,
    },
    nameInput: {
      ...ty.base,
      color: c.fg,
      fontFamily: fontFamily.sans,
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
    },
    paneActions: { flexDirection: 'row', gap: space.s3, marginBottom: space.s3 },
    actionBtn: {
      flex: 1,
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      paddingVertical: space.s4,
      alignItems: 'center',
      minHeight: target.min,
      justifyContent: 'center',
    },
    actionBtnDisabled: { opacity: 0.4 },
    actionText: { ...ty.base, fontFamily: fontFamily.sansMedium, color: c.fg },
    removeBtn: { flex: 0, alignSelf: 'stretch' },
    removeText: { color: c.danger },
  });
}
