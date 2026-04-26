import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  useColorScheme,
  SafeAreaView,
  Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, TimerConfig } from '../types';
import { loadTimers, deleteTimer } from '../storage/storage';
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

  const handleDelete = (timer: TimerConfig) => {
    Alert.alert('Delete Timer', `Delete "${timer.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => setTimers(await deleteTimer(timer.id)),
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Free Workout Timer</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} hitSlop={8}>
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
          >
            <Text style={s.bmacText}>☕  Buy me a coffee</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No timers yet.</Text>
            <Text style={s.emptyText}>Tap + to create one.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardInfo}>
              <Text style={s.cardName}>{item.name}</Text>
              <Text style={s.cardSummary}>{getTimerSummary(item)}</Text>
              <Text style={s.cardDuration}>
                Total · {formatTime(getTotalDuration(item))}
              </Text>
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity
                style={s.playBtn}
                onPress={() =>
                  navigation.navigate('ActiveWorkout', { timerId: item.id })
                }
              >
                <Text style={s.playBtnText}>▶</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('TimerEditor', { timerId: item.id })
                }
              >
                <Text style={s.linkText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={[s.linkText, s.deleteText]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('TimerEditor', {})}
      >
        <Text style={s.fabText}>+</Text>
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
    card: {
      backgroundColor: cardBg,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0 : 0.07,
      shadowRadius: 4,
      elevation: 2,
    },
    cardInfo: { flex: 1, marginRight: 12 },
    cardName: { fontSize: 17, fontWeight: '600', color: text, marginBottom: 4 },
    cardSummary: { fontSize: 13, color: sub, marginBottom: 2 },
    cardDuration: { fontSize: 12, color: sub },
    cardActions: { alignItems: 'flex-end', gap: 8 },
    playBtn: {
      backgroundColor: '#EF4444',
      width: 46,
      height: 46,
      borderRadius: 23,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playBtnText: { fontSize: 18, color: '#FFFFFF', marginLeft: 2 },
    linkText: { fontSize: 13, color: '#3B82F6', fontWeight: '500' },
    deleteText: { color: '#EF4444' },
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
