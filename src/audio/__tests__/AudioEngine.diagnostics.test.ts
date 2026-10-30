/**
 * Regression for defect workout-timer-20261018-1: on a Galaxy S24 every
 * non-voice cue was silent and the customer's diagnostic log had no audio
 * line at all, so the report could not be triaged. Three guarantees now:
 *   1. A cue's player is never released: one player per style, rewound and
 *      replayed. The old engine built a player per cue and released it on the
 *      first "finished" report, which on Android lands while the tone is still
 *      in the output buffer, so the sound was thrown away.
 *   2. The audio-mode call and the tone files fail independently. A rejected
 *      setAudioModeAsync no longer leaves the engine empty (that path was one
 *      try block, swallowed).
 *   3. Every way a cue can go missing writes a line: no tone loaded, the
 *      player reporting an error, a cue that never finishes, init failing.
 *
 * Spoken cues: an iPhone 14 on iOS 27.0.1 (2026-10-27) reported no sound, and
 * its log had no line at all for the spoken cues that every phase change uses
 * by default. They are now counted, the first one finished is logged, and one
 * that fails or never starts writes a warning.
 */

type Status = Record<string, unknown>;
type MockPlayer = {
  play: jest.Mock;
  remove: jest.Mock;
  seekTo: jest.Mock;
  listeners: Array<(s: Status) => void>;
  loop: boolean;
  volume: number;
  addListener: (n: string, fn: (s: Status) => void) => { remove: jest.Mock };
};
type AudioMock = { __players: MockPlayer[]; setAudioModeAsync: jest.Mock; createAudioPlayer: jest.Mock };
type SpeakOptions = {
  language?: string;
  volume?: number;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (err: Error) => void;
};
type SpeechMock = { speak: jest.Mock; stop: jest.Mock; getAvailableVoicesAsync: jest.Mock };
type LogMock = { logEvent: jest.Mock; logWarn: jest.Mock; logError: jest.Mock };
type Engine = typeof import('../AudioEngine').AudioEngine;

jest.mock('expo-audio', () => {
  const players: MockPlayer[] = [];
  return {
    __players: players,
    setAudioModeAsync: jest.fn(async () => {}),
    createAudioPlayer: jest.fn(() => {
      const p: MockPlayer = {
        play: jest.fn(),
        remove: jest.fn(),
        seekTo: jest.fn(async () => {}),
        listeners: [],
        loop: false,
        volume: 1,
        addListener(_: string, fn: (s: Status) => void) {
          p.listeners.push(fn);
          return { remove: jest.fn() };
        },
      };
      players.push(p);
      return p;
    }),
  };
});

jest.mock('expo-file-system/legacy', () => {
  const files = new Map<string, string>();
  return {
    cacheDirectory: 'file:///cache/',
    EncodingType: { Base64: 'base64' },
    getInfoAsync: jest.fn(async (uri: string) => ({ exists: files.has(uri) })),
    writeAsStringAsync: jest.fn(async (uri: string, data: string) => {
      files.set(uri, data);
    }),
  };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

jest.mock('../../feedback/log', () => ({ logEvent: jest.fn(), logWarn: jest.fn(), logError: jest.fn() }));

/** A fresh engine (it is a module singleton) plus fresh mocks for each test. */
function load(): { AudioEngine: Engine; audio: AudioMock; log: LogMock; players: MockPlayer[]; speech: SpeechMock } {
  jest.resetModules();
  const audio = jest.requireMock('expo-audio') as AudioMock;
  const log = jest.requireMock('../../feedback/log') as LogMock;
  const speech = jest.requireMock('expo-speech') as SpeechMock;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AudioEngine } = require('../AudioEngine') as { AudioEngine: Engine };
  return { AudioEngine, audio, log, players: audio.__players, speech };
}

/** The options of the nth Speech.speak call. */
const spoken = (speech: SpeechMock, n = 0): SpeakOptions => speech.speak.mock.calls[n][1];

const warned = (log: LogMock, msg: string) => log.logWarn.mock.calls.filter((c) => c[1] === msg);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AudioEngine diagnostics', () => {
  it('logs a skipped cue when nothing is loaded yet, instead of failing silently', async () => {
    const { AudioEngine, audio, log } = load();
    await AudioEngine.playSound('beep');
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    expect(warned(log, 'cue skipped, no tone loaded')).toEqual([
      ['audio', 'cue skipped, no tone loaded', { style: 'beep', ready: false }],
    ]);
  });

  it('still caches and plays every tone when the audio mode call is rejected', async () => {
    const { AudioEngine, audio, log, players } = load();
    audio.setAudioModeAsync.mockRejectedValueOnce(new Error('mode unsupported'));
    await AudioEngine.initialize();
    expect(warned(log, 'audio mode not applied')).toHaveLength(1);
    expect(log.logEvent).toHaveBeenCalledWith('audio', 'ready', expect.objectContaining({ styles: 10 }));
    for (const style of ['beep', 'double_beep', 'ascending_chime', 'bell', 'buzz', 'click', 'long_beep', 'triple_tone'] as const) {
      await AudioEngine.playSound(style);
    }
    await AudioEngine.playTick();
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(9);
    expect(players.every((p) => p.play.mock.calls.length === 1)).toBe(true);
    expect(log.logError).not.toHaveBeenCalled();
  });

  it('keeps one player per style and never releases it, replaying from the start', async () => {
    const { AudioEngine, audio, players } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('bell');
    await AudioEngine.playSound('bell');
    await AudioEngine.playSound('bell');
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    const bell = players[0];
    expect(bell.seekTo).toHaveBeenCalledTimes(3);
    expect(bell.play).toHaveBeenCalledTimes(3);
    // A finished report does not tear the player down either.
    bell.listeners.forEach((fn) => fn({ didJustFinish: true }));
    expect(bell.remove).not.toHaveBeenCalled();
  });

  it('builds the players a workout needs up front, skipping none and voice', async () => {
    const { AudioEngine, audio } = load();
    await AudioEngine.initialize();
    AudioEngine.prepare(['voice', 'none', 'buzz', 'buzz', 'click']);
    // buzz, click, and the countdown tick
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(3);
  });

  it('logs the style when the player reports an error, and stands the watchdog down', async () => {
    jest.useFakeTimers();
    const { AudioEngine, log, players } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('long_beep');
    players[0].listeners.forEach((fn) => fn({ error: 'Source error', didJustFinish: false }));
    expect(warned(log, 'cue failed')).toEqual([
      ['audio', 'cue failed', { style: 'long_beep', error: 'Source error' }],
    ]);
    jest.advanceTimersByTime(5000);
    expect(warned(log, 'cue never finished')).toHaveLength(0);
    jest.useRealTimers();
  });

  it('logs a cue that never reports finishing, once the watchdog fires', async () => {
    jest.useFakeTimers();
    const { AudioEngine, log } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('ascending_chime');
    jest.advanceTimersByTime(3999);
    expect(warned(log, 'cue never finished')).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(warned(log, 'cue never finished')).toEqual([
      ['audio', 'cue never finished', { style: 'ascending_chime' }],
    ]);
    jest.useRealTimers();
  });

  it('records the first finished cue as proof the sound path works, and only once', async () => {
    const { AudioEngine, log, players } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('double_beep');
    players[0].listeners.forEach((fn) => fn({ didJustFinish: true }));
    await AudioEngine.playSound('double_beep');
    players[0].listeners.forEach((fn) => fn({ didJustFinish: true }));
    const firsts = log.logEvent.mock.calls.filter((c) => c[1] === 'first cue finished');
    expect(firsts).toEqual([['audio', 'first cue finished', { style: 'double_beep' }]]);
    expect(warned(log, 'cue never finished')).toHaveLength(0);
  });

  it('never plays or logs for the none and voice styles', async () => {
    const { AudioEngine, audio, log } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('none');
    await AudioEngine.playSound('voice');
    expect(audio.createAudioPlayer).not.toHaveBeenCalled();
    expect(log.logWarn).not.toHaveBeenCalled();
  });

  it('counts the tones a workout played and finished, from zero at prepare', async () => {
    const { AudioEngine, players } = load();
    await AudioEngine.initialize();
    await AudioEngine.playSound('beep');
    AudioEngine.prepare(['beep']);
    await AudioEngine.playSound('beep');
    await AudioEngine.playTick();
    await flush();
    players[0].listeners.forEach((fn) => fn({ didJustFinish: true }));
    players[1].listeners.forEach((fn) => fn({ error: 'Source error' }));
    expect(AudioEngine.takeStats()).toMatchObject({ tones: 2, tonesFinished: 1, tonesFailed: 1 });
    expect(AudioEngine.takeStats()).toMatchObject({ tones: 0, tonesFinished: 0, tonesFailed: 0 });
  });
});

describe('AudioEngine spoken cues', () => {
  it('speaks in English at the app volume, and counts each cue through to done', async () => {
    const { AudioEngine, log, speech } = load();
    AudioEngine.setVolume(60);
    const settled = jest.fn();
    AudioEngine.speak('Warm Up', settled);
    AudioEngine.speak('Exercise');
    expect(speech.speak.mock.calls[0][0]).toBe('Warm Up');
    expect(spoken(speech)).toMatchObject({ language: 'en-US', volume: 0.6 });
    for (const n of [0, 1]) {
      spoken(speech, n).onStart?.();
      spoken(speech, n).onDone?.();
    }
    expect(settled).toHaveBeenCalledTimes(1);
    const firsts = log.logEvent.mock.calls.filter((c) => c[1] === 'first voice cue finished');
    expect(firsts).toHaveLength(1);
    expect(AudioEngine.takeStats()).toMatchObject({ voice: 2, voiceStarted: 2, voiceDone: 2, voiceFailed: 0 });
    expect(log.logWarn).not.toHaveBeenCalled();
  });

  it('warns when a spoken cue never starts', () => {
    jest.useFakeTimers();
    const { AudioEngine, log } = load();
    AudioEngine.speak('Rest');
    jest.advanceTimersByTime(4999);
    expect(warned(log, 'voice cue never started')).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(warned(log, 'voice cue never started')).toEqual([
      ['audio', 'voice cue never started', { language: 'en-US' }],
    ]);
    expect(AudioEngine.takeStats()).toMatchObject({ voice: 1, voiceStarted: 0, voiceFailed: 1 });
    jest.useRealTimers();
  });

  it('does not call a cue cut off by the next one lost', () => {
    jest.useFakeTimers();
    const { AudioEngine, log, speech } = load();
    AudioEngine.speak('Get Ready');
    AudioEngine.stopSpeech();
    expect(speech.stop).toHaveBeenCalled();
    jest.advanceTimersByTime(10000);
    expect(log.logWarn).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('logs a spoken cue the speech engine rejects, and still settles it', () => {
    const { AudioEngine, log, speech } = load();
    const settled = jest.fn();
    AudioEngine.speak('Cool Down', settled);
    spoken(speech).onError?.(new Error('synthesis failed'));
    expect(warned(log, 'voice cue failed')).toEqual([
      ['audio', 'voice cue failed', { error: 'Error: synthesis failed' }],
    ]);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(AudioEngine.takeStats()).toMatchObject({ voice: 1, voiceFailed: 1 });
  });

  it('says nothing, and counts nothing, at an app volume of 0', () => {
    const { AudioEngine, speech } = load();
    AudioEngine.setVolume(0);
    AudioEngine.speak('Exercise');
    expect(speech.speak).not.toHaveBeenCalled();
    expect(AudioEngine.takeStats().voice).toBe(0);
  });

  it('logs how many English voices the phone has, once a session', async () => {
    const { AudioEngine, log, speech } = load();
    speech.getAvailableVoicesAsync.mockResolvedValueOnce([
      { language: 'en-US' },
      { language: 'en-GB' },
      { language: 'de-DE' },
    ]);
    await AudioEngine.checkVoices();
    await AudioEngine.checkVoices();
    expect(speech.getAvailableVoicesAsync).toHaveBeenCalledTimes(1);
    expect(log.logEvent).toHaveBeenCalledWith('audio', 'voices', { total: 3, english: 2 });
    expect(log.logWarn).not.toHaveBeenCalled();
  });

  it('warns when the phone has no English voice', async () => {
    const { AudioEngine, log, speech } = load();
    speech.getAvailableVoicesAsync.mockResolvedValueOnce([{ language: 'de-DE' }]);
    await AudioEngine.checkVoices();
    expect(warned(log, 'no English voice on this phone')).toEqual([
      ['audio', 'no English voice on this phone', { total: 1 }],
    ]);
  });

  it('warns when the speech engine never answers', async () => {
    jest.useFakeTimers();
    const { AudioEngine, log, speech } = load();
    speech.getAvailableVoicesAsync.mockReturnValueOnce(new Promise(() => {}));
    const checked = AudioEngine.checkVoices();
    jest.advanceTimersByTime(5000);
    await checked;
    expect(warned(log, 'speech engine did not answer')).toHaveLength(1);
    jest.useRealTimers();
  });
});
