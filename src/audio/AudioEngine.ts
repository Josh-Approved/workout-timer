import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SoundStyle } from '../types';

interface ToneSpec {
  frequency: number;
  duration: number;
  delayAfter: number;
}

const SOUND_DEFINITIONS: Record<Exclude<SoundStyle, 'none' | 'voice'>, ToneSpec[]> = {
  click: [{ frequency: 1800, duration: 0.018, delayAfter: 0 }],
  beep: [{ frequency: 880, duration: 0.15, delayAfter: 0 }],
  double_beep: [
    { frequency: 880, duration: 0.1, delayAfter: 0.08 },
    { frequency: 880, duration: 0.1, delayAfter: 0 },
  ],
  ascending_chime: [
    { frequency: 523, duration: 0.1, delayAfter: 0.03 },
    { frequency: 659, duration: 0.1, delayAfter: 0.03 },
    { frequency: 784, duration: 0.2, delayAfter: 0 },
  ],
  bell: [{ frequency: 1047, duration: 0.5, delayAfter: 0 }],
  buzz: [{ frequency: 220, duration: 0.2, delayAfter: 0 }],
  long_beep: [{ frequency: 880, duration: 0.4, delayAfter: 0 }],
  triple_tone: [
    { frequency: 523, duration: 0.08, delayAfter: 0.04 },
    { frequency: 659, duration: 0.08, delayAfter: 0.04 },
    { frequency: 784, duration: 0.1, delayAfter: 0 },
  ],
};

// Short tick used during countdowns — always the same regardless of style
const TICK_SPEC: ToneSpec[] = [{ frequency: 660, duration: 0.08, delayAfter: 0 }];

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? chars[b2 & 63] : '=';
  }
  return result;
}

function generateSequenceWav(tones: ToneSpec[], sampleRate = 22050): Uint8Array {
  const writeStr = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  let totalSamples = 0;
  for (const t of tones) {
    totalSamples += Math.floor(sampleRate * t.duration);
    if (t.delayAfter > 0) totalSamples += Math.floor(sampleRate * t.delayAfter);
  }

  const numBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + numBytes);
  const view = new DataView(buffer);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + numBytes, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, numBytes, true);

  let byteOffset = 44;
  for (const tone of tones) {
    const toneSamples = Math.floor(sampleRate * tone.duration);
    const delaySamples = tone.delayAfter > 0 ? Math.floor(sampleRate * tone.delayAfter) : 0;
    const attack = Math.min(Math.floor(sampleRate * 0.005), toneSamples);
    const release = Math.min(Math.floor(sampleRate * 0.015), toneSamples);

    for (let i = 0; i < toneSamples; i++) {
      const t = i / sampleRate;
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > toneSamples - release) env = (toneSamples - i) / release;
      const sample = Math.round(Math.sin(2 * Math.PI * tone.frequency * t) * 0.7 * env * 32767);
      view.setInt16(byteOffset, Math.max(-32768, Math.min(32767, sample)), true);
      byteOffset += 2;
    }
    for (let i = 0; i < delaySamples; i++) {
      view.setInt16(byteOffset, 0, true);
      byteOffset += 2;
    }
  }

  return new Uint8Array(buffer);
}

class AudioEngineClass {
  private uris: Map<string, string> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: true,
      } as any);
      const cacheDir = FileSystem.cacheDirectory ?? '';
      await this.cache('tick', TICK_SPEC, cacheDir);
      for (const [style, tones] of Object.entries(SOUND_DEFINITIONS)) {
        await this.cache(style, tones, cacheDir);
      }
      this.initialized = true;
    } catch {
      // Audio init failed; app still works silently
    }
  }

  private async cache(key: string, tones: ToneSpec[], cacheDir: string): Promise<void> {
    const uri = `${cacheDir}fwt_${key}.wav`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      const wav = generateSequenceWav(tones);
      const b64 = uint8ArrayToBase64(wav);
      await FileSystem.writeAsStringAsync(uri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    this.uris.set(key, uri);
  }

  async reactivate(): Promise<void> {
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: true,
      } as any);
    } catch {
      // ignore
    }
  }

  async playSound(style: SoundStyle): Promise<void> {
    if (style === 'none') return;
    const uri = this.uris.get(style);
    if (uri) this.play(uri);
  }

  async playTick(): Promise<void> {
    const uri = this.uris.get('tick');
    if (uri) this.play(uri);
  }

  private play(uri: string): void {
    try {
      const player = createAudioPlayer({ uri });
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          subscription.remove();
          player.remove();
        }
      });
      player.play();
    } catch {
      // Silently ignore audio playback errors
    }
  }
}

export const AudioEngine = new AudioEngineClass();
