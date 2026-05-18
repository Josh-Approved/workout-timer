import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, Coffee, GripVertical, Mail, Play, Plus, Settings as SettingsIcon, Timer } from 'lucide-react-native';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers, saveTimers } from '../storage/storage';
import { getTimerSummary, getTotalDuration, formatTime } from '../utils/workout';
import { buildFeedbackEmailUrl } from '../utils/feedback';
import { SortableList } from '../components/SortableList';
import {
  useTheme,
  fontFamily,
  space,
  radius,
  type as t,
  hairline,
  target,
  Colors,
} from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TimerList'>;

export default function TimerListScreen({ navigation }: Props) {
  const [timers, setTimers] = useState<TimerConfig[]>([]);
  const { c } = useTheme();
  const s = makeStyles(c);

  useFocusEffect(
    useCallback(() => {
      loadTimers().then(setTimers);
    }, [])
  );

  const handleOrderChange = useCallback((next: TimerConfig[]) => {
    setTimers(next);
    saveTimers(next).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title} accessibilityRole="header">
          Free workout timer
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          hitSlop={8}
          accessibilityLabel="Settings"
          accessibilityRole="button"
          style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
        >
          <SettingsIcon size={22} color={c.fg} strokeWidth={1.5} />
        </Pressable>
      </View>

      <SortableList
        items={timers}
        keyExtractor={(item) => item.id}
        onOrderChange={handleOrderChange}
        contentContainerStyle={s.list}
        ListFooterComponent={
          <View style={s.footer}>
            <Pressable
              style={({ pressed }) => [s.linkRow, pressed && s.pressed]}
              onPress={() => Linking.openURL('https://buymeacoffee.com/jtysonwilliams')}
              accessibilityLabel="Buy me a coffee"
              accessibilityRole="link"
              accessibilityHint="Opens buymeacoffee.com in your browser"
            >
              <Coffee size={18} color={c.fgMuted} strokeWidth={1.5} />
              <Text style={s.linkText}>Buy me a coffee?</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.linkRow, pressed && s.pressed]}
              onPress={() => Linking.openURL(buildFeedbackEmailUrl())}
              accessibilityLabel="Send feedback"
              accessibilityRole="link"
              accessibilityHint="Opens your email app to send feedback or report a bug"
            >
              <Mail size={18} color={c.fgMuted} strokeWidth={1.5} />
              <Text style={s.linkText}>Send feedback</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty} accessibilityLiveRegion="polite">
            <View style={s.emptyIcon} importantForAccessibility="no">
              <Timer size={32} color={c.fgSubtle} strokeWidth={1.25} />
            </View>
            <Text style={s.emptyTitle}>No timers yet</Text>
            <Text style={s.emptyHint}>Tap + to build your first one.</Text>
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
              accessibilityLabel={`Edit ${item.name}`}
              accessibilityRole="button"
              accessibilityHint="Opens the editor. Use the actions rotor to move this timer up or down."
              accessibilityActions={accessibilityProps.accessibilityActions}
              onAccessibilityAction={accessibilityProps.onAccessibilityAction}
            >
              <View style={s.cardInfo} importantForAccessibility="no">
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardSummary}>{getTimerSummary(item)}</Text>
                <Text style={s.cardDuration}>
                  Total · {formatTime(getTotalDuration(item))}
                </Text>
              </View>
              <ChevronRight
                size={20}
                color={c.fgSubtle}
                strokeWidth={1.5}
                importantForAccessibility="no"
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.playBtn, pressed && s.pressed]}
              onPress={() => navigation.navigate('ActiveWorkout', { timerId: item.id })}
              accessibilityLabel={`Start ${item.name}`}
              accessibilityRole="button"
              accessibilityHint="Begins the workout"
            >
              <Play size={20} color={c.inkButtonText} strokeWidth={1.75} fill={c.inkButtonText} />
            </Pressable>
          </View>
        )}
      />

      <Pressable
        style={({ pressed }) => [s.fab, pressed && s.pressed]}
        onPress={() => navigation.navigate('TimerEditor', {})}
        accessibilityLabel="Create new timer"
        accessibilityRole="button"
      >
        <Plus size={28} color={c.inkButtonText} strokeWidth={1.75} />
      </Pressable>
    </SafeAreaView>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: space.s6,
      paddingVertical: space.s4,
      borderBottomWidth: hairline,
      borderBottomColor: c.hairline,
    },
    title: {
      ...t.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
    },
    iconBtn: {
      width: target.min,
      height: target.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    // paddingBottom must clear the absolutely-positioned FAB (bottom:
    // space.s8, 56pt tall → top edge at space.s8 + 56) plus a margin, so the
    // last timer card can always scroll clear of the FAB and its play button
    // is never occluded (was a flat 120 ≈ the FAB's top edge, leaving the
    // last card under the FAB at the just-saved scroll position).
    list: { padding: space.s5, paddingBottom: space.s8 + 56 + space.s8 },

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
      ...t.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
      marginBottom: space.s2,
    },
    cardSummary: {
      ...t.sm,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
      marginBottom: space.s1,
    },
    cardDuration: {
      ...t.xs,
      color: c.fgSubtle,
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

    empty: { alignItems: 'center', paddingTop: space.s9, gap: space.s3 },
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
      ...t.md,
      color: c.fg,
      fontFamily: fontFamily.sansSemibold,
    },
    emptyHint: {
      ...t.sm,
      color: c.fgMuted,
      fontFamily: fontFamily.sans,
    },
    footer: { alignItems: 'center', gap: space.s5, paddingTop: space.s7 },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.s3,
      paddingVertical: space.s3,
    },
    linkText: {
      ...t.sm,
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
