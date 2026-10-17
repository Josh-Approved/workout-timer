import { TimerConfig } from '../types';

// Curated timers shown in screenshots. Names and shapes chosen to fill the
// list view nicely and to give the editor screen recognizable copy.
const T0 = 1700000000000;

export const QA_TIMERS: TimerConfig[] = [
  {
    id: 'qa-tabata',
    name: 'Standard Tabata',
    initialCountdown: 10,
    warmUp: 0,
    exercise: 20,
    rest: 10,
    sets: 8,
    recovery: 0,
    cycles: 1,
    coolDown: 60,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'qa-hiit',
    name: 'Full Body HIIT',
    initialCountdown: 10,
    warmUp: 30,
    exercise: 40,
    rest: 20,
    sets: 6,
    recovery: 60,
    cycles: 2,
    coolDown: 60,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: 'qa-circuit',
    name: 'Endurance Circuit',
    initialCountdown: 10,
    warmUp: 45,
    exercise: 30,
    rest: 15,
    sets: 4,
    recovery: 90,
    cycles: 3,
    coolDown: 120,
    createdAt: T0,
    updatedAt: T0,
  },
  // Sources the store listing's "climbing" screenshot slot (screenshots.config
  // id: climbing) — values match the shipped store asset exactly, so the CI
  // capture regenerates the same frame instead of the framer failing on a
  // missing one-off capture.
  {
    id: 'qa-hangboard',
    name: 'Climbing Hangboard',
    initialCountdown: 15,
    warmUp: 0,
    exercise: 7,
    rest: 3,
    sets: 6,
    recovery: 180,
    cycles: 6,
    coolDown: 0,
    createdAt: T0,
    updatedAt: T0,
  },
  // A custom sequence, so the list and sequence-editor captures show named
  // intervals (the 2026-10-17 competitive-review gap). Kept last so the
  // anchored Standard Tabata / Climbing Hangboard positions don't move.
  {
    id: 'qa-sequence',
    name: 'Kettlebell Circuit',
    kind: 'sequence',
    initialCountdown: 10,
    warmUp: 30,
    exercise: 0,
    rest: 0,
    sets: 1,
    recovery: 0,
    cycles: 1,
    coolDown: 60,
    repeats: 3,
    intervals: [
      { id: 'qa-seq-swings', name: 'Swings', duration: 30, kind: 'work' },
      { id: 'qa-seq-rest-1', name: 'Rest', duration: 15, kind: 'rest' },
      { id: 'qa-seq-goblet', name: 'Goblet squats', duration: 30, kind: 'work' },
      { id: 'qa-seq-rest-2', name: 'Rest', duration: 15, kind: 'rest' },
      { id: 'qa-seq-carry', name: 'Farmer carry', duration: 45, kind: 'work' },
      { id: 'qa-seq-rest-3', name: 'Rest', duration: 45, kind: 'rest' },
    ],
    createdAt: T0,
    updatedAt: T0,
  },
  // AMRAP: a 12-minute block with the round counter.
  {
    id: 'qa-amrap',
    name: '12 Minute AMRAP',
    kind: 'amrap',
    initialCountdown: 10,
    warmUp: 0,
    exercise: 0,
    rest: 0,
    sets: 1,
    recovery: 0,
    cycles: 1,
    coolDown: 0,
    timeCap: 720,
    createdAt: T0,
    updatedAt: T0,
  },
];
