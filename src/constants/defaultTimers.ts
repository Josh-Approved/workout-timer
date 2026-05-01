import { TimerConfig, AppSettings, SoundSettings } from '../types';

const now = Date.now();

export const DEFAULT_TIMERS: TimerConfig[] = [
  {
    id: 'default_tabata',
    name: 'Standard Tabata',
    initialCountdown: 30,
    warmUp: 0,
    exercise: 20,
    rest: 10,
    sets: 8,
    recovery: 0,
    cycles: 1,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default_hiit',
    name: 'Full Body HIIT',
    initialCountdown: 5,
    warmUp: 30,
    exercise: 40,
    rest: 20,
    sets: 6,
    recovery: 60,
    cycles: 2,
    coolDown: 60,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default_endurance',
    name: 'Endurance Circuit',
    initialCountdown: 10,
    warmUp: 45,
    exercise: 30,
    rest: 15,
    sets: 4,
    recovery: 90,
    cycles: 3,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
];

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  countdownTick: 'beep',
  warmUpStart: 'voice',
  workStart: 'voice',
  restStart: 'voice',
  recoveryStart: 'voice',
  coolDownStart: 'voice',
  workoutComplete: 'voice',
  halfwaySound: 'none',
  countdownDuration: 3,
};

export const DEFAULT_SETTINGS: AppSettings = {
  sounds: DEFAULT_SOUND_SETTINGS,
  audioAccessibilityMode: false,
};
