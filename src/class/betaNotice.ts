/**
 * Whether this phone has seen the class mode beta note. Shown once, the first
 * time Class mode is opened; kept on the phone.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@fwt/classBetaSeen';

export async function classBetaSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    return true; // never nag when storage is unreadable
  }
}

export async function markClassBetaSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // shown again next time; harmless
  }
}
