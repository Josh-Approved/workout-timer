import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers } from '../storage/storage';
import { getTimerSummary, getTotalDuration, formatTime } from '../utils/workout';

type Props = NativeStackScreenProps<RootStackParamList, 'TimerList'>;

export default function TimerListScreen({ navigation }: Props) {
  const [timers, setTimers] = useState<TimerConfig[]>([]);
  const isDark = useColorScheme() === 'dark';
  const s = makeStyles(isDark);

  useFocusEffect(
    useCallback(() => {
      loadTimers().then(setTimers);
    }, [])
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text
          style={s.title}
          accessibilityRole="header"
        >
          Free Workout Timer
        </Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          hitSlop={8}
          accessibilityLabel="Settings"
          accessibilityRole="button"
        >
          <Text style={s.headerIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={timers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        ListFooterComponent={
          <TouchableOpacity
            style={s.bmacRow}
            onPress={() => Linking.openURL('https://buymeacoffee.com/jtysonwilliams')}
            accessibilityLabel="Buy me a coffee"
            accessibilityRole="link"
            accessibilityHint="Opens buymeacoffee.com in your browser"
          >
            <Text style={s.bmacText}>☕  Buy me a coffee?</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={s.empty} accessibilityLiveRegion="polite">
            <Text style={s.emptyText}>No timers yet.</Text>
            <Text style={s.emptyText}>Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={s.card}
            accessible={false}
          >
            {/* Main row: info left, play button right (vertically centered) */}
            <View style={s.cardMain}>
              <View style={s.cardInfo}>
                <Text style={s.cardName}>{item.name}</Text>
                <Text style={s.cardSummary}>{getTimerSummary(item)}</Text>
                <Text style={s.cardDuration}>
                  Total · {formatTime(getTotalDuration(item))}
                </Text>
              </View>
              <TouchableOpacity
                style={s.playBtn}
                onPress={() => navigation.navigate('ActiveWorkout', { timerId: item.id })}
                accessibilityLabel={`Start ${item.name}`}
                accessibilityRole="button"
                accessibilityHint="Begins the workout"
              >
                <Text style={s.playBtnText} importantForAccessibility="no">▶</Text>
              </TouchableOpacity>
            </View>

            {/* Footer row: edit button */}
            <View style={s.cardFooter}>
              <TouchableOpacity
                onPress={() => navigation.navigate('TimerEditor', { timerId: item.id })}
                accessibilityLabel={`Edit ${item.name}`}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={s.editText}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('TimerEditor', {})}
        accessibilityLabel="Create new timer"
        accessibilityRole="button"
      >
        <Text style={s.fabText} importantForAccessibility="no">+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function makeStyles(isDark: boolean) {
  const bg = isDark ? '#121212' : '#F5F5F5';
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const text = isDark ? '#FFFFFF' : '#111111';
  const sub = isDark ? '#AAAAAA' : '#666666';
  const border = isDark ? '#2A2A2A' : '#E8E8E8';

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    title: { fontSize: 22, fontWeight: '700', color: text },
    headerIcon: { fontSize: 22 },
    list: { padding: 16, paddingBottom: 100 },

    // Card: column layout
    card: {
      backgroundColor: cardBg,
      borderRadius: 14,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.07,
      shadowRadius: 4,
      elevation: 2,
      overflow: 'hidden',
    },
    // Top section: info + vertically-centered play button
    cardMain: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    cardInfo: { flex: 1, marginRight: 12 },
    cardName: { fontSize: 17, fontWeight: '600', color: text, marginBottom: 4 },
    cardSummary: { fontSize: 13, color: sub, marginBottom: 2 },
    cardDuration: { fontSize: 12, color: sub },
    playBtn: {
      backgroundColor: '#EF4444',
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playBtnText: { fontSize: 18, color: '#FFFFFF', marginLeft: 2 },

    // Footer: edit button
    cardFooter: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: border,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    editText: { fontSize: 14, color: '#3B82F6', fontWeight: '500' },

    empty: { alignItems: 'center', paddingTop: 80, gap: 6 },
    emptyText: { fontSize: 16, color: sub },
    bmacRow: { alignItems: 'center', paddingVertical: 24 },
    bmacText: { fontSize: 15, color: sub },
    fab: {
      position: 'absolute',
      right: 24,
      bottom: 40,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#EF4444',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 6,
    },
    fabText: { fontSize: 30, color: '#FFFFFF', lineHeight: 34 },
  });
}
