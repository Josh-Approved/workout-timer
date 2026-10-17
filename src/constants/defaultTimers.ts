import { TimerConfig, AppSettings, SoundSettings } from '../types';

const now = Date.now();

/** Blank fields shared by the non-interval kinds (sequence / AMRAP / For Time). */
const NO_INTERVAL_FIELDS = {
  warmUp: 0,
  exercise: 0,
  rest: 0,
  sets: 1,
  recovery: 0,
  cycles: 1,
  coolDown: 0,
};

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
  // One custom-sequence template, so the shape is discoverable from the list
  // without reading a help screen: a bodyweight circuit with named intervals,
  // played twice.
  {
    id: 'default_sequence_circuit',
    name: 'Bodyweight Circuit',
    kind: 'sequence',
    initialCountdown: 15,
    ...NO_INTERVAL_FIELDS,
    warmUp: 60,
    coolDown: 60,
    repeats: 2,
    intervals: [
      { id: 'seq_squats', name: 'Squats', duration: 40, kind: 'work' },
      { id: 'seq_rest_1', name: 'Rest', duration: 20, kind: 'rest' },
      { id: 'seq_pushups', name: 'Push-ups', duration: 40, kind: 'work' },
      { id: 'seq_rest_2', name: 'Rest', duration: 20, kind: 'rest' },
      { id: 'seq_plank', name: 'Plank', duration: 40, kind: 'work' },
      { id: 'seq_rest_3', name: 'Rest', duration: 60, kind: 'rest' },
    ],
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
  // Halfway-through-interval cue on by default, using the unobtrusive Click.
  halfwaySound: 'click',
  countdownDuration: 3,
};

export const DEFAULT_SETTINGS: AppSettings = {
  sounds: DEFAULT_SOUND_SETTINGS,
  audioAccessibilityMode: false,
};
