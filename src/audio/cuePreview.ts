/**
 * Settings-screen previews: play one cue the way a workout would, at the
 * current app volume, so a pick or a volume change is heard as it will sound.
 */

import * as Speech from 'expo-speech';
import { SoundEventKey, SoundStyle } from '../types';
import { AudioEngine } from './AudioEngine';

const VOICE_PREVIEW_PHRASES: Partial<Record<SoundEventKey, string>> = {
  warmUpStart: 'Warm Up',
  workStart: 'Exercise',
  restStart: 'Rest',
  recoveryStart: 'Recovery',
  coolDownStart: 'Cool Down',
  workoutComplete: 'Workout Complete',
  halfwaySound: 'Halfway',
};

export function previewCue(key: SoundEventKey, style: SoundStyle): void {
  if (style === 'voice') {
    const phrase = VOICE_PREVIEW_PHRASES[key];
    const volume = AudioEngine.getVolume();
    if (phrase && volume > 0) Speech.speak(phrase, { language: 'en-US', volume });
  } else if (style !== 'none') {
    AudioEngine.playSound(style).catch(() => {});
  }
}
