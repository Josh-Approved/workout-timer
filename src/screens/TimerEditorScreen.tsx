import React, { useEffect, useState } from 'react';
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
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers, saveTimer, deleteTimer } from '../storage/storage';
import { generateId } from '../utils/workout';
import { t } from '../i18n';
import { SliderField } from '../components/SliderField';
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

const EMPTY_TIMER: Omit<TimerConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
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
};

export default function TimerEditorScreen({ route, navigation }: Props) {
  const { timerId } = route.params ?? {};
  const { c } = useTheme();
  const s = makeStyles(c);

  const [form, setForm] = useState({ ...EMPTY_TIMER });

  useEffect(() => {
    if (timerId) {
      loadTimers().then((timers) => {
        const found = timers.find((x) => x.id === timerId);
        if (found) {
          const { id, createdAt, updatedAt, ...fields } = found;
          setForm(fields);
        }
      });
    }
  }, [timerId]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert(t('editor.nameRequiredTitle'), t('editor.nameRequiredBody'));
      return;
    }
    if (form.exercise < 1) {
      Alert.alert(t('editor.exerciseRequiredTitle'), t('editor.exerciseRequiredBody'));
      return;
    }
    const timer: TimerConfig = {
      id: timerId ?? generateId(),
      ...form,
      name: form.name.trim(),
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
                placeholderTextColor={c.fgSubtle}
                maxLength={60}
                returnKeyType="done"
                accessibilityLabel={t('editor.nameA11y')}
                accessibilityHint={t('editor.nameHint')}
              />
            </View>
          </View>

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
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle} accessibilityRole="header">{t('editor.intervals')}</Text>
            <View style={s.sectionBody}>
              <SliderField
                label={t('editor.exercise')}
                hint={t('editor.exerciseHint')}
                value={form.exercise}
                onChange={(v) => set('exercise', Math.max(5, v))}
                min={5}
                max={600}
                step={5}
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

          {timerId ? (
            <Pressable
              style={({ pressed }) => [s.deleteBtn, pressed && s.pressed]}
              onPress={handleDelete}
              accessibilityLabel={t('editor.deleteTimer')}
              accessibilityRole="button"
              accessibilityHint={t('editor.deleteHint')}
            >
              <Text style={s.deleteBtnText}>{t('editor.deleteTimer')}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
    nameInput: {
      ...ty.base,
      color: c.fg,
      fontFamily: fontFamily.sans,
      paddingHorizontal: space.s5,
      paddingVertical: space.s4,
    },
    deleteBtn: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      paddingVertical: space.s5,
      alignItems: 'center',
      marginTop: space.s3,
      marginBottom: space.s5,
    },
    deleteBtnText: {
      ...ty.base,
      fontFamily: fontFamily.sansMedium,
      color: c.danger,
    },
  });
}

