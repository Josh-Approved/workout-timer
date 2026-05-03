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
];
