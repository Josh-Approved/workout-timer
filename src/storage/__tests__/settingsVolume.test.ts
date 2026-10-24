/**
 * The cue-volume setting arrived without a settings-version bump on purpose:
 * a bump resets every stored setting to defaults. Settings saved before it
 * existed must load with the user's own sounds intact and volume at 100%.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, saveSettings } from '../storage';
import { DEFAULT_SETTINGS } from '../../constants/defaultTimers';

beforeEach(() => AsyncStorage.clear());

it('fills in full volume for settings saved before the volume control', async () => {
  const { volume: _omit, ...oldSounds } = { ...DEFAULT_SETTINGS.sounds, workStart: 'bell' as const };
  await AsyncStorage.setItem(
    '@fwt/settings',
    JSON.stringify({ sounds: oldSounds, audioAccessibilityMode: true, _version: 2 })
  );

  const loaded = await loadSettings();
  expect(loaded.sounds.volume).toBe(100);
  expect(loaded.sounds.workStart).toBe('bell');
  expect(loaded.audioAccessibilityMode).toBe(true);
});

it('keeps a lowered volume across a save and load', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS, sounds: { ...DEFAULT_SETTINGS.sounds, volume: 35 } });
  expect((await loadSettings()).sounds.volume).toBe(35);
});
