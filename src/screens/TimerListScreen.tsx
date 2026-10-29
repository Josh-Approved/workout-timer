import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, GripVertical, Play, Plus, Settings as SettingsIcon, Timer, Users } from 'lucide-react-native';
import { nowMs } from 'live-timer';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers, saveTimers, duplicateTimer } from '../storage/storage';
import { loadClassSession, canRejoin, clearClassSession, type ClassSession } from '../class/session';
import { getTimerSummary, getTotalDuration, formatTime, generateId, isOpenEnded } from '../utils/workout';
import { t } from '../i18n';
import { TIP_JAR_ENABLED } from '../constants/features';
import { TIP_PRODUCT_IDS } from '../constants/tipProducts';
import TipJarSheet from '../components/TipJarSheet';
import { FundingFooter } from '../components/FundingFooter';
import { SortableList } from '../components/SortableList';
import { usePullRevealFooter } from '../components/usePullRevealFooter';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as ty,
  hairline,
  target,
  Colors,
} from '../theme';
import { boundedContent } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TimerList'>;

export default function TimerListScreen({ navigation }: Props) {
  const [timers, setTimers] = useState<TimerConfig[]>([]);
  // A class this phone was in when the app last closed, if it can still be rejoined.
  const [rejoinable, setRejoinable] = useState<ClassSession | null>(null);
  const [tipVisible, setTipVisible] = useState(false);
  const { c } = useTheme();
  const s = makeStyles(c);

  // Pull-to-reveal funding footer (rests at the bottom of the scroll; the
  // wordmark pops on over-pull). iOS drives it; Android shows the mark statically.
  const {
    pullToReveal,
    reveal,
    listPanGesture,
    onScroll,
    onScrollViewLayout,
    onContentSizeChange,
    footerHeight,
    onFooterLayout,
  } = usePullRevealFooter();

  useFocusEffect(
    useCallback(() => {
      loadTimers().then(setTimers);
      loadClassSession().then((saved) => {
        if (saved && canRejoin(saved, nowMs(), Date.now())) setRejoinable(saved);
        else {
          setRejoinable(null);
          if (saved) clearClassSession();
        }
      });
    }, [])
  );

  const handleOrderChange = useCallback((next: TimerConfig[]) => {
    setTimers(next);
    saveTimers(next).catch(() => {});
  }, []);

  // Duplicate (a screen-reader rotor action on the row, and the editor's
  // button): the copy lands under the original and opens for editing.
  const handleDuplicate = useCallback(
    async (item: TimerConfig) => {
      const copy = await duplicateTimer(
        item.id,
        generateId(),
        t('timerList.copyName', { name: item.name }),
        generateId,
      );
      if (!copy) return;
      setTimers(await loadTimers());
      navigation.navigate('TimerEditor', { timerId: copy.id });
    },
    [navigation],
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title} accessibilityRole="header">
          {t('timerList.title')}
        </Text>
        <View style={s.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('Class')}
            hitSlop={8}
            accessibilityLabel={t('classMode.entry')}
            accessibilityHint={t('classMode.entryHint')}
            accessibilityRole="button"
            style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
          >
            <Users size={22} color={c.fg} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('Settings')}
            hitSlop={8}
            accessibilityLabel={t('settings.title')}
            accessibilityRole="button"
            style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
          >
            <SettingsIcon size={22} color={c.fg} strokeWidth={1.5} />
          </Pressable>
        </View>
      </View>
      {rejoinable ? (
        <Pressable
          onPress={() => {
            const session = rejoinable;
            setRejoinable(null);
            navigation.navigate('ActiveWorkout', { classSession: session });
          }}
          style={({ pressed }) => [s.rejoin, pressed && s.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${t('classMode.rejoin')}. ${t('classMode.rejoinHint', { name: rejoinable.workout.name })}`}
        >
          <Users size={20} color={c.fg} strokeWidth={1.5} />
          <Text style={s.rejoinText} importantForAccessibility="no">
            {t('classMode.rejoin')} · {t('classMode.rejoinHint', { name: rejoinable.workout.name })}
          </Text>
        </Pressable>
      ) : null}

      <SortableList
        items={timers}
        keyExtractor={(item) => item.id}
        onOrderChange={handleOrderChange}
        moveUpLabel={t('timerList.moveUp')}
        moveDownLabel={t('timerList.moveDown')}
        contentContainerStyle={s.list}
        onScroll={pullToReveal ? onScroll : undefined}
        alwaysBounceVertical={pullToReveal}
        panGesture={listPanGesture}
        onScrollViewLayout={onScrollViewLayout}
        onContentSizeChange={onContentSizeChange}
        ListFooterComponent={
          <View style={s.footerHolder} onLayout={onFooterLayout}>
            <FundingFooter
              onSupport={TIP_JAR_ENABLED ? () => setTipVisible(true) : undefined}
              reveal={reveal}
              pullToReveal={pullToReveal}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty} accessibilityLiveRegion="polite">
            <View style={s.emptyIcon} importantForAccessibility="no">
              <Timer size={32} color={c.fgSubtle} strokeWidth={1.25} />
            </View>
            <Text style={s.emptyTitle}>{t('timerList.emptyTitle')}</Text>
            <Text style={s.emptyHint}>{t('timerList.emptyHint')}</Text>
          </View>
        }
        renderItem={({ item, drag, accessibilityProps }) => (
          <View style={s.card} accessible={false}>
            <Pressable
              style={s.dragHandle}
              onLongPress={drag}
              delayLongPress={150}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <GripVertical size={18} color={c.fgSubtle} strokeWidth={1.5} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.cardBody, pressed && s.cardBodyPressed]}
              onPress={() => navigation.navigate('TimerEditor', { timerId: item.id })}
              onLongPress={drag}
              delayLongPress={250}
              accessibilityLabel={t('timerList.editTimer', { name: item.name })}
              accessibilityRole="button"
              accessibilityHint={t('timerList.editTimerHint')}
              accessibilityActions={[
                ...accessibilityProps.accessibilityActions,
                { name: 'duplicate', label: t('timerList.duplicate') },
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'duplicate') handleDuplicate(item);
                else accessibilityProps.onAccessibilityAction(event);
              }}
            >
              <View style={s.cardInfo} importantForAccessibility="no">
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardSummary}>{getTimerSummary(item)}</Text>
                {!isOpenEnded(item) ? (
                  <Text style={s.cardDuration}>
                    {t('timerList.total')} · {formatTime(getTotalDuration(item))}
                  </Text>
                ) : null}
              </View>
              <ChevronRight
                size={20}
                color={c.fgMuted}
                strokeWidth={1.5}
                importantForAccessibility="no"
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.playBtn, pressed && s.pressed]}
              onPress={() => navigation.navigate('ActiveWorkout', { timerId: item.id })}
              accessibilityLabel={t('timerList.startTimer', { name: item.name })}
              accessibilityRole="button"
              accessibilityHint={t('timerList.startTimerHint')}
            >
              <Play size={20} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
            </Pressable>
          </View>
        )}
      />

      <Pressable
        style={({ pressed }) => [s.fab, { bottom: footerHeight + space.s4 }, pressed && s.pressed]}
        onPress={() => navigation.navigate('TimerEditor', {})}
        accessibilityLabel={t('timerList.createNew')}
        accessibilityRole="button"
      >
        <Plus size={28} color={c.inkButtonText} strokeWidth={1.75} />
      </Pressable>
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: space.s6,
      paddingVertical: space.s4,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
    title: {
      ...ty.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
    rejoin: {
      ...boundedContent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      paddingHorizontal: space.s6,
      paddingVertical: space.s4,
      backgroundColor: c.bgSubtle,
    },
    rejoinText: { ...ty.sm, flex: 1, color: c.fg, fontFamily: fontFamily.sansSemibold },
    iconBtn: {
      width: target.min,
      height: target.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    // flexGrow lets a SHORT list fill the screen so the footer (the list's
    // ListFooterComponent) rests at the BOTTOM of the scroll, not under the
    // last card; a long list flows past it normally. The footer is the bottom
    // content now and the FAB floats just above it (offset by the measured
    // footer height), so no large bottom padding is needed.
    list: { ...boundedContent, padding: space.s5, paddingBottom: space.s5, flexGrow: 1 },
    // Pushed to the bottom of the scroll when the list is short (via flexGrow
    // above); flows naturally after the last card when the list is long.
    footerHolder: { marginTop: 'auto' },

    card: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: space.s4,
      overflow: 'hidden',
    },
    dragHandle: {
      width: 32,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: space.s2,
    },
    cardBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: space.s2,
      paddingRight: space.s4,
      paddingVertical: space.s5,
      gap: space.s3,
    },
    cardBodyPressed: { backgroundColor: c.bg },
    cardInfo: { flex: 1 },
    cardName: {
      ...ty.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
      marginBottom: space.s2,
    },
    cardSummary: {
      ...ty.sm,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
      marginBottom: space.s1,
    },
    cardDuration: {
      ...ty.xs,
      color: c.fgMuted,
      fontFamily: fontFamily.mono,
    },
    playBtn: {
      backgroundColor: c.inkButton,
      width: 56,
      borderTopRightRadius: radius.md,
      borderBottomRightRadius: radius.md,
      justifyContent: 'center',
      alignItems: 'center',
    },

    empty: { ...boundedContent, alignItems: 'center', paddingTop: space.s9, gap: space.s3 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.hairline,
      backgroundColor: c.bgElevated,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: space.s2,
    },
    emptyTitle: {
      ...ty.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
    },
    emptyHint: {
      ...ty.sm,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
    },
    fab: {
      position: 'absolute',
      right: space.s6,
      bottom: space.s8,
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      backgroundColor: c.inkButton,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
