/**
 * The workout's sound check, for the diagnostic log. A "no sound" report from
 * an iPhone 14 on iOS 27.0.1 (2026-10-27) came with a log that showed one
 * click played and nothing else: no word on the spoken cues, the phone's
 * volume, or where the sound was going, so a phone turned all the way down and
 * a cue that never played looked the same. Now every workout opens with what
 * the phone will do with its sound and closes with what its cues actually did.
 *
 * Reads only, and never in the way: every step is best-effort and swallowed.
 */

import { getAudioOutput, type AudioOutput } from 'live-timer';
import { SoundSettings, SoundEventKey } from '../types';
import { AudioEngine } from './AudioEngine';
import { logEvent, logWarn } from '../feedback/log';

/** The cues that mark a phase starting, in workout order. */
const PHASE_CUES: SoundEventKey[] = [
  'warmUpStart',
  'workStart',
  'restStart',
  'recoveryStart',
  'coolDownStart',
  'workoutComplete',
];

/** Short names, so six cues fit the log's field length. */
const CUE_NAMES: Partial<Record<SoundEventKey, string>> = {
  warmUpStart: 'warmUp',
  workStart: 'work',
  restStart: 'rest',
  recoveryStart: 'recovery',
  coolDownStart: 'coolDown',
  workoutComplete: 'complete',
};

/** The phase cues as one short field: the style when they all agree, else each. */
export function describePhaseCues(sounds: SoundSettings): string {
  const styles = PHASE_CUES.map((key) => sounds[key]);
  if (styles.every((s) => s === styles[0])) return styles[0];
  return PHASE_CUES.map((key) => `${CUE_NAMES[key]}:${sounds[key]}`).join(' ');
}

/** Whether a workout with these settings will speak at all. */
function speaks(sounds: SoundSettings, speechMode: boolean): boolean {
  return speechMode || PHASE_CUES.some((key) => sounds[key] === 'voice') || sounds.halfwaySound === 'voice';
}

/** The phone side of the sound, as log fields. */
function phoneFields(out: AudioOutput | null): Record<string, string | number | boolean> {
  if (!out) return { phoneVolume: 'unknown' };
  const fields: Record<string, string | number | boolean> = {
    phoneVolume: Math.round(out.volume * 100) / 100,
    output: out.output,
  };
  if (out.otherAudio != null) fields.otherAudio = out.otherAudio;
  return fields;
}

let running = false;

/** Log what the phone will do with this workout's sound. Call once the
 *  workout's audio is running (after the keep-alive starts): iOS reports the
 *  phone's volume reliably only while the app's sound session is active. */
export async function startSoundCheck(sounds: SoundSettings, speechMode: boolean): Promise<void> {
  try {
    running = true;
    const out = await getAudioOutput();
    logEvent('audio', 'workout sound check', {
      ...phoneFields(out),
      appVolume: sounds.volume,
      phaseCues: describePhaseCues(sounds),
      halfway: sounds.halfwaySound,
      countdown: sounds.countdownDuration,
      announcements: speechMode,
    });
    if (out && out.volume === 0) logWarn('audio', 'phone media volume is off', { output: out.output });
    if (sounds.volume === 0) logWarn('audio', 'app cue volume is 0');
    if (speaks(sounds, speechMode)) await AudioEngine.checkVoices();
  } catch {
    /* diagnostics never get in the workout's way */
  }
}

/** Log what this workout's cues did. Call as the workout screen closes. */
export async function endSoundCheck(): Promise<void> {
  if (!running) return;
  running = false;
  try {
    const stats = AudioEngine.takeStats();
    const out = await getAudioOutput();
    logEvent('audio', 'workout sound summary', { ...stats, ...phoneFields(out) });
  } catch {
    /* diagnostics never get in the workout's way */
  }
}
