import AsyncStorage from '@react-native-async-storage/async-storage';
import { TimerConfig, AppSettings } from '../types';
import { DEFAULT_TIMERS, DEFAULT_SETTINGS } from '../constants/defaultTimers';

const TIMERS_KEY = '@fwt/timers';
const SETTINGS_KEY = '@fwt/settings';

export async function loadTimers(): Promise<TimerConfig[]> {
  try {
    const json = await AsyncStorage.getItem(TIMERS_KEY);
    if (json) return JSON.parse(json);
    await saveTimers(DEFAULT_TIMERS);
    return DEFAULT_TIMERS;
  } catch {
    return DEFAULT_TIMERS;
  }
}

export async function saveTimers(timers: TimerConfig[]): Promise<void> {
  await AsyncStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
}

export async function saveTimer(timer: TimerConfig): Promise<TimerConfig[]> {
  const timers = await loadTimers();
  const idx = timers.findIndex((t) => t.id === timer.id);
  if (idx >= 0) {
    timers[idx] = { ...timer, updatedAt: Date.now() };
  } else {
    timers.push({ ...timer, createdAt: Date.now(), updatedAt: Date.now() });
  }
  await saveTimers(timers);
  return timers;
}

export async function deleteTimer(id: string): Promise<TimerConfig[]> {
  const timers = await loadTimers();
  const updated = timers.filter((t) => t.id !== id);
  await saveTimers(updated);
  return updated;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json) {
      const saved = JSON.parse(json);
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        sounds: { ...DEFAULT_SETTINGS.sounds, ...saved.sounds },
      };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
