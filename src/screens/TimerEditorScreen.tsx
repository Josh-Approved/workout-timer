import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, TimerConfig, TimerKind, SequenceInterval } from '../types';
import { loadTimers, saveTimer, deleteTimer, duplicateTimer } from '../storage/storage';
import { generateId, newSequenceInterval } from '../utils/workout';
import { t } from '../i18n';
import { SliderField, FINE_SECONDS_BELOW } from '../components/SliderField';
import { OptionChips } from '../components/OptionChips';
import {
  SequenceIntervalsList,
  SequenceIntervalPane,
} from '../components/SequenceIntervalsEditor';
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
import { boundedContent } from '../theme';

// Single source for both create (route param `timerId` undefined) and edit
// (`timerId` present). Any field/slider change applies to both flows.
type Props = NativeStackScreenProps<RootStackParamList, 'TimerEditor'>;

type Form = Omit<TimerConfig, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY_TIMER: Form = {
  name: '',
  kind: 'intervals',
  // New timers get a 15s get-ready countdown by default; users can change or
  // zero it out in the editor.
  initialCountdown: 15,
  warmUp: 0,
  exercise: 20,
  rest: 10,
  sets: 8,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
  intervals: [],
  repeats: 1,
  // AMRAP default: 10 minutes. For Time default: no cap (0).
  timeCap: 600,
};

const KIND_ORDER: TimerKind[] = ['intervals', 'sequence', 'amrap', 'for_time'];

const kindLabelKey: Record<TimerKind, string> = {
  intervals: 'editor.typeIntervals',
  sequence: 'editor.typeSequence',
  amrap: 'editor.typeAmrap',
  for_time: 'editor.typeForTime',
};
const kindHintKey: Record<TimerKind, string> = {
  intervals: 'editor.typeIntervalsHint',
  sequence: 'editor.typeSequenceHint',
  amrap: 'editor.typeAmrapHint',
  for_time: 'editor.typeForTimeHint',
};

export default function TimerEditorScreen({ route, navigation }: Props) {
  const { timerId, kind: requestedKind } = route.params ?? {};
  const { c } = useTheme();
  const s = makeStyles(c);

  const [form, setForm] = useState<Form>({ ...EMPTY_TIMER, kind: requestedKind ?? 'intervals' });
  /** Which sequence interval's pane is open. */
  const [openIntervalId, setOpenIntervalId] = useState<string | null>(null);

  useEffect(() => {
    if (timerId) {
      loadTimers().then((timers) => {
        const found = timers.find((x) => x.id === timerId);
        if (found) {
          const { id, createdAt, updatedAt, ...fields } = found;
          setForm({ ...EMPTY_TIMER, ...fields, kind: fields.kind ?? 'intervals' });
        }
      });
    }
  }, [timerId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const kind: TimerKind = form.kind ?? 'intervals';
  const intervals = form.intervals ?? [];

  // Switching kind on a new timer resets the kind-specific defaults (the AMRAP
  // cap vs. the For Time "no cap") without touching the shared fields.
  const pickKind = (next: TimerKind) => {
    setForm((prev) => ({
      ...prev,
      kind: next,
      timeCap: next === 'amrap' ? (prev.timeCap && prev.timeCap > 0 ? prev.timeCap : 600) : next === 'for_time' ? 0 : prev.timeCap,
    }));
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return 'name';
    if (kind === 'intervals' && form.exercise < 1) return 'exercise';
    if (kind === 'sequence' && !intervals.some((iv) => iv.duration > 0)) return 'sequence';
    if (kind === 'amrap' && !((form.timeCap ?? 0) >= 1)) return 'timeCap';
    return null;
  };

  const handleSave = async () => {
    const problem = validate();
    if (problem === 'name') {
      Alert.alert(t('editor.nameRequiredTitle'), t('editor.nameRequiredBody'));
      return;
    }
    if (problem === 'exercise') {
      Alert.alert(t('editor.exerciseRequiredTitle'), t('editor.exerciseRequiredBody'));
      return;
    }
    if (problem === 'sequence') {
      Alert.alert(t('editor.sequenceRequiredTitle'), t('editor.sequenceRequiredBody'));
      return;
    }
    if (problem === 'timeCap') {
      Alert.alert(t('editor.timeCapRequiredTitle'), t('editor.timeCapRequiredBody'));
      return;
    }
    const timer: TimerConfig = {
      id: timerId ?? generateId(),
      ...form,
      kind,
      name: form.name.trim(),
      // Only the fields a kind uses are persisted for it.
      intervals: kind === 'sequence' ? intervals : undefined,
      repeats: kind === 'sequence' ? Math.max(1, form.repeats ?? 1) : undefined,
      timeCap: kind === 'amrap' || kind === 'for_time' ? form.timeCap ?? 0 : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTimer(timer);
    navigation.goBack();
  };

  const handleDelete = () => {
    Alert.alert(
      t('editor.deleteTitle'),
      t('editor.deleteBody', { name: form.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteTimer(timerId!);
            navigation.goBack();
          },
        },
      ]
    );
  };

  // Copies the SAVED timer (not unsaved edits) and swaps this editor for the
  // copy's, so Back returns to the list, not to the original's editor.
  const handleDuplicate = async () => {
    if (!timerId) return;
    const copy = await duplicateTimer(
      timerId,
      generateId(),
      t('timerList.copyName', { name: form.name.trim() || t('editor.intervalTitle') }),
      generateId,
    );
    if (copy) navigation.replace('TimerEditor', { timerId: copy.id });
  };

  // ---- Sequence interval editing ----
  const openInterval = useMemo(
    () => intervals.find((iv) => iv.id === openIntervalId) ?? null,
    [intervals, openIntervalId],
  );
  const openIndex = intervals.findIndex((iv) => iv.id === openIntervalId);

  const updateInterval = (next: SequenceInterval) =>
    set('intervals', intervals.map((iv) => (iv.id === next.id ? next : iv)));

  const addInterval = () => {
    const iv = newSequenceInterval(t('editor.kindWork'), 30, 'work');
    set('intervals', [...intervals, iv]);
    setOpenIntervalId(iv.id);
  };

  const moveInterval = (delta: -1 | 1) => {
    if (openIndex < 0) return;
    const to = openIndex + delta;
    if (to < 0 || to >= intervals.length) return;
    const next = [...intervals];
    const [moved] = next.splice(openIndex, 1);
    next.splice(to, 0, moved);
    set('intervals', next);
  };

  const removeInterval = () => {
    if (openIndex < 0) return;
    set('intervals', intervals.filter((iv) => iv.id !== openIntervalId));
    setOpenIntervalId(null);
  };

  const paneOpen = openInterval != null;

  return (
    <SafeAreaView style={s.container}>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={paneOpen}
        importantForAccessibility={paneOpen ? 'no-hide-descendants' : 'auto'}
      >
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
        <Text style={s.headerTitle} accessibilityRole="header">
          {timerId ? t('editor.editTitle') : t('editor.newTitle')}
        </Text>
        <Pressable
          onPress={handleSave}
          hitSlop={8}
          accessibilityLabel={t('editor.saveTimer')}
          accessibilityRole="button"
          style={({ pressed }) => [s.headerSide, s.headerSideRight, pressed && s.pressed]}
        >
          <Text style={s.headerSave}>{t('common.save')}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.name')}</Text>
            <View style={s.sectionBody}>
              <TextInput
                style={s.nameInput}
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder={t('editor.namePlaceholder')}
                placeholderTextColor={c.fgMuted}
                maxLength={60}
                returnKeyType="done"
                accessibilityLabel={t('editor.nameA11y')}
                accessibilityHint={t('editor.nameHint')}
              />
            </View>
          </View>

          {/* The kind is chosen when a timer is created; an existing timer
              keeps its kind (its fields would not carry over). */}
          {!timerId ? (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.timerType')}</Text>
              <OptionChips
                options={KIND_ORDER.map((k) => ({ key: k, label: t(kindLabelKey[k]) }))}
                selectedKey={kind}
                onPick={(key) => pickKind(key as TimerKind)}
              />
              <Text style={s.kindHint}>{t(kindHintKey[kind])}</Text>
            </View>
          ) : (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.timerType')}</Text>
              <Text style={s.kindFixed}>{t(kindLabelKey[kind])}</Text>
            </View>
          )}

          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.preparation')}</Text>
            <View style={s.sectionBody}>
              <SliderField
                label={t('editor.initialCountdown')}
                hint={t('editor.initialCountdownHint')}
                value={form.initialCountdown}
                onChange={(v) => set('initialCountdown', v)}
                min={0}
                max={600}
                step={5}
                isTime
                colors={c}
              />
              {kind === 'intervals' || kind === 'sequence' ? (
                <SliderField
                  label={t('editor.warmUp')}
                  hint={t('editor.warmUpHint')}
                  value={form.warmUp}
                  onChange={(v) => set('warmUp', v)}
                  min={0}
                  max={600}
                  step={5}
                  isTime
                  colors={c}
                />
              ) : null}
            </View>
          </View>

          {kind === 'intervals' ? (
            <>
              <View style={s.section}>
                <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervals')}</Text>
                <View style={s.sectionBody}>
                  <SliderField
                    label={t('editor.exercise')}
                    hint={t('editor.exerciseHint')}
                    value={form.exercise}
                    onChange={(v) => set('exercise', Math.max(1, v))}
                    min={1}
                    max={600}
                    step={5}
                    fineBelow={FINE_SECONDS_BELOW}
                    isTime
                    colors={c}
                  />
                  <SliderField
                    label={t('editor.rest')}
                    hint={t('editor.restHint')}
                    value={form.rest}
                    onChange={(v) => set('rest', v)}
                    min={0}
                    max={600}
                    step={5}
                    fineBelow={FINE_SECONDS_BELOW}
                    isTime
                    colors={c}
                  />
                </View>
              </View>

              <View style={s.section}>
                <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.structure')}</Text>
                <View style={s.sectionBody}>
                  <SliderField
                    label={t('editor.sets')}
                    hint={t('editor.setsHint')}
                    value={form.sets}
                    onChange={(v) => set('sets', Math.max(1, v))}
                    min={1}
                    max={30}
                    step={1}
                    colors={c}
                  />
                  <SliderField
                    label={t('editor.cycles')}
                    hint={t('editor.cyclesHint')}
                    value={form.cycles}
                    onChange={(v) => set('cycles', Math.max(1, v))}
                    min={1}
                    max={20}
                    step={1}
                    colors={c}
                  />
                  <SliderField
                    label={t('editor.recovery')}
                    hint={t('editor.recoveryHint')}
                    value={form.recovery}
                    onChange={(v) => set('recovery', v)}
                    min={0}
                    max={600}
                    step={5}
                    isTime
                    colors={c}
                  />
                </View>
              </View>
            </>
          ) : null}

          {kind === 'sequence' ? (
            <>
              <View style={s.section}>
                <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervals')}</Text>
                <SequenceIntervalsList
                  intervals={intervals}
                  onOpen={setOpenIntervalId}
                  onAdd={addInterval}
                />
              </View>
              <View style={s.section}>
                <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.structure')}</Text>
                <View style={s.sectionBody}>
                  <SliderField
                    label={t('editor.repeats')}
                    hint={t('editor.repeatsHint')}
                    value={form.repeats ?? 1}
                    onChange={(v) => set('repeats', Math.max(1, v))}
                    min={1}
                    max={20}
                    step={1}
                    colors={c}
                  />
                </View>
              </View>
            </>
          ) : null}

          {kind === 'amrap' || kind === 'for_time' ? (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.timeCap')}</Text>
              <View style={s.sectionBody}>
                <SliderField
                  label={t('editor.timeCap')}
                  hint={t(kind === 'amrap' ? 'editor.amrapCapHint' : 'editor.forTimeCapHint')}
                  value={form.timeCap ?? 0}
                  onChange={(v) => set('timeCap', kind === 'amrap' ? Math.max(30, v) : v)}
                  min={kind === 'amrap' ? 30 : 0}
                  max={3600}
                  step={30}
                  isTime
                  colors={c}
                />
              </View>
            </View>
          ) : null}

          {kind === 'intervals' || kind === 'sequence' ? (
            <View style={s.section}>
              <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.finish')}</Text>
              <View style={s.sectionBody}>
                <SliderField
                  label={t('editor.coolDown')}
                  hint={t('editor.coolDownHint')}
                  value={form.coolDown}
                  onChange={(v) => set('coolDown', v)}
                  min={0}
                  max={600}
                  step={5}
                  isTime
                  colors={c}
                />
              </View>
            </View>
          ) : null}

          {timerId ? (
            <>
              <Pressable
                style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
                onPress={handleDuplicate}
                accessibilityLabel={t('editor.duplicateTimer')}
                accessibilityRole="button"
                accessibilityHint={t('editor.duplicateHint')}
              >
                <Text style={s.secondaryBtnText}>{t('editor.duplicateTimer')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
                onPress={handleDelete}
                accessibilityLabel={t('editor.deleteTimer')}
                accessibilityRole="button"
                accessibilityHint={t('editor.deleteHint')}
              >
                <Text style={s.deleteBtnText}>{t('editor.deleteTimer')}</Text>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      </View>

      {kind === 'sequence' ? (
        <SequenceIntervalPane
          interval={openInterval}
          index={openIndex}
          count={intervals.length}
          onChange={updateInterval}
          onMove={moveInterval}
          onRemove={removeInterval}
          onClose={() => setOpenIntervalId(null)}
        />
      ) : null}
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
      minHeight: target.min + space.s2,
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
    headerSave: { ...ty.base, color: c.fg, fontFamily: fontFamily.sansSemibold },
    scroll: { ...boundedContent, padding: space.s5, paddingBottom: space.s8 },
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
    sectionBody: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      overflow: 'hidden',
    },
    kindHint: {
      ...ty.sm,
      fontFamily: fontFamily.sans,
      color: c.fgMuted,
      marginTop: space.s3,
      paddingHorizontal: space.s1,
    },
    kindFixed: {
      ...ty.base,
      fontFamily: fontFamily.sans,
      color: c.fg,
      paddingHorizontal: space.s1,
    },
    nameInput: {
      ...ty.base,
      color: c.fg,
      fontFamily: fontFamily.sans,
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
    },
    secondaryBtn: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      paddingVertical: space.s5,
      alignItems: 'center',
      marginTop: space.s3,
    },
    secondaryBtnText: {
      ...ty.base,
      fontFamily: fontFamily.sansMedium,
      color: c.fg,
    },
    deleteBtnText: {
      ...ty.base,
      fontFamily: fontFamily.sansMedium,
      color: c.danger,
    },
  });
}
