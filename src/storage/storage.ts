import AsyncStorage from '@react-native-async-storage/async-storage';
import { TimerConfig, AppSettings } from '../types';
import { DEFAULT_TIMERS, DEFAULT_SETTINGS } from '../constants/defaultTimers';
import { QA_MODE } from '../qa/qaMode';
import { QA_TIMERS } from '../qa/fixtures';
import { logEvent, logError } from '../feedback/log';
import { migrateTimersPayload, packTimers, TIMERS_VERSION } from './timersMigration';

const TIMERS_KEY = '@fwt/timers';
const SETTINGS_KEY = '@fwt/settings';
const SETTINGS_VERSION = 2;

const initialTimers = (): TimerConfig[] => (QA_MODE ? QA_TIMERS : DEFAULT_TIMERS);

export async function loadTimers(): Promise<TimerConfig[]> {
  try {
    const json = await AsyncStorage.getItem(TIMERS_KEY);
    if (json) {
      const { timers, from, changed } = migrateTimersPayload(JSON.parse(json));
      if (from != null) {
        if (changed) {
          // The one place a user's timers change shape. Logged so "my timers
          // look different after the update" has a trail.
          logEvent('timers', 'migrated stored payload', { from, to: TIMERS_VERSION, count: timers.length });
          await saveTimers(timers);
        }
        logEvent('timers', 'loaded', { count: timers.length });
        return timers;
      }
      logError('timers', new Error('unrecognized timers payload'), { during: 'load', fellBackTo: 'defaults' });
      return initialTimers();
    }
    const seeds = initialTimers();
    logEvent('timers', 'seeded defaults (nothing stored yet)', { count: seeds.length });
    await saveTimers(seeds);
    return seeds;
  } catch (err) {
    // Silent until now, and it is the worst failure this app has: the user's
    // own timers are quietly replaced by the defaults. "My timers disappeared"
    // was unanswerable without this line.
    logError('timers', err, { during: 'load', fellBackTo: 'defaults' });
    return initialTimers();
  }
}

export async function saveTimers(timers: TimerConfig[]): Promise<void> {
  await AsyncStorage.setItem(TIMERS_KEY, JSON.stringify(packTimers(timers)));
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

/**
 * Copy a saved timer. The copy gets `newId`, `newName`, fresh timestamps and
 * its own interval ids, and lands directly under the original in the list.
 * Returns the copy, or null when the source no longer exists.
 */
export async function duplicateTimer(
  id: string,
  newId: string,
  newName: string,
  intervalId: () => string,
): Promise<TimerConfig | null> {
  const timers = await loadTimers();
  const idx = timers.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const copy = cloneTimer(timers[idx], newId, newName, intervalId);
  timers.splice(idx + 1, 0, copy);
  await saveTimers(timers);
  logEvent('timers', 'duplicated', { kind: copy.kind ?? 'intervals' });
  return copy;
}

/** Pure copy of a timer under a new identity. Exported for tests. */
export function cloneTimer(
  source: TimerConfig,
  newId: string,
  newName: string,
  intervalId: () => string,
): TimerConfig {
  const now = Date.now();
  return {
    ...source,
    id: newId,
    name: newName,
    intervals: source.intervals?.map((iv) => ({ ...iv, id: intervalId() })),
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    if (json) {
      const saved = JSON.parse(json);
      if (!saved._version || saved._version < SETTINGS_VERSION) {
        // A settings reset the user never asked for — worth a line, because
        // "all my sounds went back to default after an update" starts here.
        logEvent('settings', 'reset to defaults on version bump', {
          from: Number(saved._version) || 0,
          to: SETTINGS_VERSION,
        });
        await saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      return {
        ...DEFAULT_SETTINGS,
        ...saved,
        sounds: { ...DEFAULT_SETTINGS.sounds, ...saved.sounds },
      };
    }
    return DEFAULT_SETTINGS;
  } catch (err) {
    logError('settings', err, { during: 'load', fellBackTo: 'defaults' });
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, _version: SETTINGS_VERSION }));
}
