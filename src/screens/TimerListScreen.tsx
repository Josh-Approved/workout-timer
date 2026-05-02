import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Coffee, Mail, Play, Plus, Settings as SettingsIcon } from 'lucide-react-native';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers } from '../storage/storage';
import { getTimerSummary, getTotalDuration, formatTime } from '../utils/workout';
import { buildFeedbackEmailUrl } from '../utils/feedback';
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

      <FlatList
        data={timers}
        keyExtractor={(item) => item.id}
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
            <Text style={s.emptyText}>No timers yet.</Text>
            <Text style={s.emptyText}>Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card} accessible={false}>
            <View style={s.cardMain}>
              <View style={s.cardInfo}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardSummary}>{getTimerSummary(item)}</Text>
                <Text style={s.cardDuration}>
                  Total · {formatTime(getTotalDuration(item))}
                </Text>
              </View>
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

            <View style={s.cardFooter}>
              <Pressable
                onPress={() => navigation.navigate('TimerEditor', { timerId: item.id })}
                accessibilityLabel={`Edit ${item.name}`}
                accessibilityRole="button"
                hitSlop={8}
                style={({ pressed }) => [pressed && s.pressed]}
              >
                <Text style={s.editText}>Edit</Text>
              </Pressable>
            </View>
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
    list: { padding: space.s5, paddingBottom: 120 },

    card: {
      backgroundColor: c.bgElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.hairline,
      marginBottom: space.s4,
      overflow: 'hidden',
    },
    cardMain: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: space.s5,
    },
    cardInfo: { flex: 1, marginRight: space.s4 },
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
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      justifyContent: 'center',
      alignItems: 'center',
    },

    cardFooter: {
      borderTopWidth: hairline,
      borderTopColor: c.hairline,
      paddingHorizontal: space.s5,
      paddingVertical: space.s3,
    },
    editText: {
      ...t.sm,
      color: c.fg,
      fontFamily: fontFamily.sansMedium,
      textDecorationLine: 'underline',
      textDecorationColor: c.hairlineStrong,
    },

    empty: { alignItems: 'center', paddingTop: space.s9, gap: space.s2 },
    emptyText: {
      ...t.base,
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
