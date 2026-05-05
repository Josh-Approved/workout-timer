import { TimerConfig, AppSettings, SoundSettings } from '../types';

const now = Date.now();

export const DEFAULT_TIMERS: TimerConfig[] = [
  {
    id: 'default_tabata',
    name: 'Standard Tabata',
    initialCountdown: 15,
    warmUp: 120,
    exercise: 20,
    rest: 10,
    sets: 8,
    recovery: 0,
    cycles: 4,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default_hiit_beginner',
    name: 'Beginner HIIT',
    initialCountdown: 15,
    warmUp: 120,
    exercise: 20,
    rest: 60,
    sets: 6,
    recovery: 60,
    cycles: 2,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default_hiit_intermediate',
    name: 'Intermediate HIIT',
    initialCountdown: 15,
    warmUp: 120,
    exercise: 30,
    rest: 60,
    sets: 6,
    recovery: 60,
    cycles: 3,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'default_hiit_advanced',
    name: 'Advanced HIIT',
    initialCountdown: 15,
    warmUp: 120,
    exercise: 45,
    rest: 45,
    sets: 10,
    recovery: 60,
    cycles: 3,
    coolDown: 120,
    createdAt: now,
    updatedAt: now,
  },
];

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
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
