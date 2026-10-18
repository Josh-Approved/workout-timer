import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SoundStyle } from '../types';
import { logEvent, logWarn, logError } from '../feedback/log';

/**
 * How long a cue may take to report it finished before we call it lost. The
 * longest tone is half a second; four seconds leaves room for a slow decoder
 * without letting a stuck player hide (or leak) for a whole workout.
 */
const CUE_WATCHDOG_MS = 4000;

/**
 * Silence appended after the last tone of every cue. Android's media output
 * runs through a deep buffer with real latency (largest on Samsung phones),
 * and the player reports a sub-second clip "finished" while the tail of it is
 * still in that buffer; anything the engine then does to the player (release,
 * seek) discards it. A third of a second of zeros means the audible part has
 * drained before the player ever reaches the end of the file.
 */
const TAIL_SILENCE_SECONDS = 0.35;

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

function generateSequenceWav(tones: ToneSpec[], sampleRate = 44100): Uint8Array {
  const writeStr = (view: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  let totalSamples = 0;
  for (const t of tones) {
    totalSamples += Math.floor(sampleRate * t.duration);
    if (t.delayAfter > 0) totalSamples += Math.floor(sampleRate * t.delayAfter);
  }
  const tailSamples = Math.floor(sampleRate * TAIL_SILENCE_SECONDS);
  totalSamples += tailSamples;

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

  // Peak amplitude as a fraction of full scale. Headroom of ~3% absorbs the
  // small overshoot from the harmonic stack below without clipping.
  const PEAK = 0.97;
  // Sum of weights for the band-limited square approximation. Used to
  // normalize the waveform back to ±1 before scaling to PEAK.
  const HARMONIC_NORM = 1 + 1 / 3 + 1 / 5 + 1 / 7;

  let byteOffset = 44;
  for (const tone of tones) {
    const toneSamples = Math.floor(sampleRate * tone.duration);
    const delaySamples = tone.delayAfter > 0 ? Math.floor(sampleRate * tone.delayAfter) : 0;
    const attack = Math.min(Math.floor(sampleRate * 0.005), toneSamples);
    const release = Math.min(Math.floor(sampleRate * 0.015), toneSamples);
    const nyquist = sampleRate / 2;

    for (let i = 0; i < toneSamples; i++) {
      const t = i / sampleRate;
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > toneSamples - release) env = (toneSamples - i) / release;

      const w = 2 * Math.PI * tone.frequency * t;
      let wave = Math.sin(w);
      if (tone.frequency * 3 < nyquist) wave += Math.sin(3 * w) / 3;
      if (tone.frequency * 5 < nyquist) wave += Math.sin(5 * w) / 5;
      if (tone.frequency * 7 < nyquist) wave += Math.sin(7 * w) / 7;
      wave /= HARMONIC_NORM;

      const sample = Math.round(wave * PEAK * env * 32767);
      view.setInt16(byteOffset, Math.max(-32768, Math.min(32767, sample)), true);
      byteOffset += 2;
    }
    for (let i = 0; i < delaySamples; i++) {
      view.setInt16(byteOffset, 0, true);
      byteOffset += 2;
    }
  }
  // Tail silence: the buffer is zero-filled already, nothing to write.

  return new Uint8Array(buffer);
}

// Silent ~1s WAV used as a keep-alive loop while a workout is active.
// iOS suspends a backgrounded app's JS bridge if no audio is playing —
// even with the audio entitlement granted. Looping silent audio keeps
// the audio session continuously active, which keeps iOS from
// suspending the bridge, which lets phase transitions and beep cues
// fire when the phone is locked. Standard workout-app pattern.
function generateSilenceWav(durationSeconds = 1, sampleRate = 44100): Uint8Array {
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const numBytes = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + numBytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numBytes, true);
  // remaining bytes already zeroed
  return new Uint8Array(buffer);
}

class AudioEngineClass {
  private uris: Map<string, string> = new Map();
  private initialized = false;
  private keepAlivePlayer: ReturnType<typeof createAudioPlayer> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const started = Date.now();
    // The audio mode and the tone files are independent: a mode call the OS
    // rejects must not take every cue down with it (it used to — one try block
    // around both, swallowed, and the engine stayed empty and silent with
    // nothing in the diagnostic log to say so).
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: true,
      } as any);
    } catch (err) {
      logWarn('audio', 'audio mode not applied', { error: String(err) });
    }
    try {
      const cacheDir = FileSystem.cacheDirectory ?? '';
      await this.cache('tick', TICK_SPEC, cacheDir);
      for (const [style, tones] of Object.entries(SOUND_DEFINITIONS)) {
        await this.cache(style, tones, cacheDir);
      }
      await this.cacheSilence(cacheDir);
      this.initialized = true;
      logEvent('audio', 'ready', { styles: this.uris.size, ms: Date.now() - started });
    } catch (err) {
      // Nothing cached: the app still works, silently — and now says so.
      logError('audio', err, { during: 'initialize', cached: this.uris.size });
    }
  }

  private async cache(key: string, tones: ToneSpec[], cacheDir: string): Promise<void> {
    // Bump the version segment whenever generateSequenceWav changes so that
    // existing users regenerate their cached tones instead of replaying stale
    // ones. v3: trailing silence (TAIL_SILENCE_SECONDS).
    const uri = `${cacheDir}fwt_v3_${key}.wav`;
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

  private async cacheSilence(cacheDir: string): Promise<void> {
    const uri = `${cacheDir}fwt_v3_silence.wav`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) {
      const wav = generateSilenceWav(1);
      const b64 = uint8ArrayToBase64(wav);
      await FileSystem.writeAsStringAsync(uri, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
    this.uris.set('silence', uri);
  }

  async startKeepAlive(): Promise<void> {
    if (this.keepAlivePlayer) return;
    const uri = this.uris.get('silence');
    if (!uri) return;
    try {
      const player = createAudioPlayer({ uri });
      player.loop = true;
      player.volume = 0;
      player.play();
      this.keepAlivePlayer = player;
    } catch {
      // best effort
    }
  }

  stopKeepAlive(): void {
    if (!this.keepAlivePlayer) return;
    try {
      this.keepAlivePlayer.pause();
      this.keepAlivePlayer.remove();
    } catch {
      // ignore
    }
    this.keepAlivePlayer = null;
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
    if (style === 'none' || style === 'voice') return;
    this.play(style);
  }

  async playTick(): Promise<void> {
    this.play('tick');
  }

  /** Cues that reported they finished this session — proof in the log that
   *  the sound path works at all, logged once so a workout doesn't flood it. */
  private cuesFinished = 0;

  /**
   * One long-lived player per cue, created on first use and replayed from the
   * start after that. The previous engine made a fresh player for every cue
   * and released it the moment it reported finished; on Android that report
   * arrives while the tone is still in the output buffer, so releasing the
   * player threw the sound away (defect workout-timer-20261018-1: every
   * non-voice cue silent on a Galaxy S24, down to a click on the emulator).
   * Keeping the player means nothing is ever torn down mid-tone.
   */
  private players: Map<string, ReturnType<typeof createAudioPlayer>> = new Map();
  /** The watchdog for the cue currently playing on each player. */
  private watchdogs: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Create the players a workout will need before it starts, so the first
   *  cue of the session is not also the first time its player is built. */
  prepare(styles: SoundStyle[]): void {
    for (const style of styles) {
      if (style === 'none' || style === 'voice') continue;
      this.playerFor(style);
    }
    this.playerFor('tick');
  }

  private playerFor(key: string): ReturnType<typeof createAudioPlayer> | null {
    const existing = this.players.get(key);
    if (existing) return existing;
    const uri = this.uris.get(key);
    if (!uri) return null;
    try {
      const player = createAudioPlayer({ uri });
      player.addListener('playbackStatusUpdate', (status) => {
        const failure = (status as { error?: string | null }).error;
        if (failure) {
          this.settle(key);
          logWarn('audio', 'cue failed', { style: key, error: String(failure) });
          return;
        }
        if (status.didJustFinish) {
          this.settle(key);
          if (this.cuesFinished++ === 0) logEvent('audio', 'first cue finished', { style: key });
        }
      });
      this.players.set(key, player);
      return player;
    } catch (err) {
      logWarn('audio', 'cue player not created', { style: key, error: String(err) });
      return null;
    }
  }

  private settle(key: string): void {
    const timer = this.watchdogs.get(key);
    if (timer) clearTimeout(timer);
    this.watchdogs.delete(key);
  }

  private play(key: string): void {
    if (!this.uris.get(key)) {
      // The one line the customer's log was missing: an attempt with nothing
      // to play. Collapses to ×N in the report, so it costs one line.
      logWarn('audio', 'cue skipped, no tone loaded', { style: key, ready: this.initialized });
      return;
    }
    const player = this.playerFor(key);
    if (!player) return;
    this.settle(key);
    this.watchdogs.set(
      key,
      setTimeout(() => {
        this.watchdogs.delete(key);
        logWarn('audio', 'cue never finished', { style: key });
      }, CUE_WATCHDOG_MS),
    );
    try {
      // A player that has reached the end stays there until it is rewound;
      // the seek is also what restarts a cue that is still playing.
      player
        .seekTo(0)
        .then(() => player.play())
        .catch((err) => {
          this.settle(key);
          logWarn('audio', 'cue failed', { style: key, error: String(err) });
        });
    } catch (err) {
      this.settle(key);
      logWarn('audio', 'cue failed', { style: key, error: String(err) });
    }
  }
}

export const AudioEngine = new AudioEngineClass();
