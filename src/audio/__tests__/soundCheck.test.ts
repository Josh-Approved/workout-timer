/**
 * The workout sound check: each workout opens with what the phone will do with
 * its sound (volume, where it goes, the cue settings) and closes with what its
 * cues did, so a "no sound" report says whether the phone or the app was quiet.
 * The report that prompted it: iPhone 14, iOS 27.0.1, 2026-10-27.
 */

import { DEFAULT_SOUND_SETTINGS } from '../../constants/defaultTimers';
import type { SoundSettings } from '../../types';

jest.mock('live-timer', () => ({ getAudioOutput: jest.fn() }));
jest.mock('../AudioEngine', () => ({
  AudioEngine: { takeStats: jest.fn(), checkVoices: jest.fn(async () => {}) },
}));
jest.mock('../../feedback/log', () => ({ logEvent: jest.fn(), logWarn: jest.fn() }));

type Check = typeof import('../soundCheck');
type Mocks = {
  getAudioOutput: jest.Mock;
  engine: { takeStats: jest.Mock; checkVoices: jest.Mock };
  log: { logEvent: jest.Mock; logWarn: jest.Mock };
};

/** A fresh module (it remembers whether a check is running) and its mocks. */
function load(): Check & Mocks {
  jest.resetModules();
  const { getAudioOutput } = jest.requireMock('live-timer') as { getAudioOutput: jest.Mock };
  const engine = (jest.requireMock('../AudioEngine') as { AudioEngine: Mocks['engine'] }).AudioEngine;
  const log = jest.requireMock('../../feedback/log') as Mocks['log'];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const check = require('../soundCheck') as Check;
  return { ...check, getAudioOutput, engine, log };
}

const beeps: SoundSettings = {
  ...DEFAULT_SOUND_SETTINGS,
  warmUpStart: 'beep',
  workStart: 'beep',
  restStart: 'beep',
  recoveryStart: 'beep',
  coolDownStart: 'beep',
  workoutComplete: 'beep',
  halfwaySound: 'click',
};

beforeEach(() => jest.clearAllMocks());

describe('workout sound check', () => {
  it('logs the phone volume, where the sound goes, and the cue settings', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValue({ volume: 0.4375, output: 'bluetooth', otherAudio: true });
    await c.startSoundCheck(DEFAULT_SOUND_SETTINGS, false);
    expect(c.log.logEvent).toHaveBeenCalledWith('audio', 'workout sound check', {
      phoneVolume: 0.44,
      output: 'bluetooth',
      otherAudio: true,
      appVolume: 100,
      phaseCues: 'voice',
      halfway: 'click',
      countdown: 3,
      announcements: false,
    });
    expect(c.log.logWarn).not.toHaveBeenCalled();
  });

  it('warns when the phone media volume is all the way down', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValue({ volume: 0, output: 'speaker', otherAudio: null });
    await c.startSoundCheck(DEFAULT_SOUND_SETTINGS, false);
    expect(c.log.logWarn).toHaveBeenCalledWith('audio', 'phone media volume is off', { output: 'speaker' });
    // Android can't say whether another app is playing; the field is left out.
    expect(c.log.logEvent.mock.calls[0][2]).not.toHaveProperty('otherAudio');
  });

  it('warns when the app cue volume is 0', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValue({ volume: 1, output: 'speaker', otherAudio: false });
    await c.startSoundCheck({ ...DEFAULT_SOUND_SETTINGS, volume: 0 }, false);
    expect(c.log.logWarn).toHaveBeenCalledWith('audio', 'app cue volume is 0');
  });

  it('says the phone volume is unknown on a binary without the native reader', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValue(null);
    await c.startSoundCheck(beeps, false);
    expect(c.log.logEvent.mock.calls[0][2]).toMatchObject({ phoneVolume: 'unknown', phaseCues: 'beep' });
    expect(c.log.logWarn).not.toHaveBeenCalled();
  });

  it('checks the phone has an English voice only when the workout will speak', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValue(null);
    await c.startSoundCheck(beeps, false);
    expect(c.engine.checkVoices).not.toHaveBeenCalled();
    await c.startSoundCheck(beeps, true);
    expect(c.engine.checkVoices).toHaveBeenCalledTimes(1);
    await c.startSoundCheck({ ...beeps, halfwaySound: 'voice' }, false);
    await c.startSoundCheck(DEFAULT_SOUND_SETTINGS, false);
    expect(c.engine.checkVoices).toHaveBeenCalledTimes(3);
  });

  it('closes the workout with what its cues did and the phone volume then', async () => {
    const c = load();
    c.getAudioOutput.mockResolvedValueOnce({ volume: 0, output: 'speaker', otherAudio: false });
    await c.startSoundCheck(DEFAULT_SOUND_SETTINGS, false);
    const stats = {
      tones: 4, tonesFinished: 4, tonesFailed: 0,
      voice: 2, voiceStarted: 2, voiceDone: 2, voiceFailed: 0,
    };
    c.engine.takeStats.mockReturnValue(stats);
    c.getAudioOutput.mockResolvedValueOnce({ volume: 0.75, output: 'speaker', otherAudio: false });
    await c.endSoundCheck();
    expect(c.log.logEvent).toHaveBeenLastCalledWith('audio', 'workout sound summary', {
      ...stats,
      phoneVolume: 0.75,
      output: 'speaker',
      otherAudio: false,
    });
    // Once per workout: a second close writes nothing.
    await c.endSoundCheck();
    expect(c.log.logEvent).toHaveBeenCalledTimes(2);
  });

  it('writes no summary for a workout that never started its check', async () => {
    const c = load();
    await c.endSoundCheck();
    expect(c.log.logEvent).not.toHaveBeenCalled();
    expect(c.engine.takeStats).not.toHaveBeenCalled();
  });

  it('never throws into the workout', async () => {
    const c = load();
    c.getAudioOutput.mockRejectedValue(new Error('bridge gone'));
    await expect(c.startSoundCheck(DEFAULT_SOUND_SETTINGS, false)).resolves.toBeUndefined();
    await expect(c.endSoundCheck()).resolves.toBeUndefined();
  });
});

describe('describePhaseCues', () => {
  it('names one style when every phase cue agrees, and each cue when they differ', () => {
    const c = load();
    expect(c.describePhaseCues(DEFAULT_SOUND_SETTINGS)).toBe('voice');
    expect(c.describePhaseCues({ ...beeps, restStart: 'bell', workoutComplete: 'none' })).toBe(
      'warmUp:beep work:beep rest:bell recovery:beep coolDown:beep complete:none',
    );
  });
});
