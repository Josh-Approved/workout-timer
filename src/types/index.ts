/**
 * Which kind of timer a saved TimerConfig is. `intervals` is the classic
 * one-tap Tabata/HIIT shape (and the default for every timer saved before the
 * field existed); the other three were added 2026-10-17.
 */
export type TimerKind = 'intervals' | 'sequence' | 'amrap' | 'for_time';

export const ALL_TIMER_KINDS: TimerKind[] = ['intervals', 'sequence', 'amrap', 'for_time'];

/** One user-built interval inside a custom sequence. */
export type IntervalKind = 'work' | 'rest';

export interface SequenceInterval {
  id: string;
  /** Spoken and shown in place of the generic phase name. */
  name: string;
  /** Seconds. */
  duration: number;
  kind: IntervalKind;
}

export interface TimerConfig {
  id: string;
  name: string;
  /** Absent on timers saved before 2026-10 — read it through `timerKind()`. */
  kind?: TimerKind;
  initialCountdown: number;
  warmUp: number;
  exercise: number;
  rest: number;
  sets: number;
  recovery: number;
  cycles: number;
  coolDown: number;
  /** Custom sequence only: the ordered list the user built. */
  intervals?: SequenceInterval[];
  /** Custom sequence only: how many times the whole list plays (>= 1). */
  repeats?: number;
  /** AMRAP: the countdown length. For Time: the optional cap (0 = none). Seconds. */
  timeCap?: number;
  createdAt: number;
  updatedAt: number;
}

/** The effective kind of a timer, defaulting legacy records to `intervals`. */
export function timerKind(timer: Pick<TimerConfig, 'kind'>): TimerKind {
  return timer.kind ?? 'intervals';
}

export type SoundStyle =
  | 'voice'
  | 'beep'
  | 'double_beep'
  | 'ascending_chime'
  | 'bell'
  | 'buzz'
  | 'click'
  | 'long_beep'
  | 'triple_tone'
  | 'none';

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  voice: 'Voice',
  beep: 'Beep',
  double_beep: 'Double Beep',
  ascending_chime: 'Ascending Chime',
  bell: 'Bell',
  buzz: 'Buzz',
  click: 'Click',
  long_beep: 'Long Beep',
  triple_tone: 'Triple Tone',
  none: 'None',
};

export const ALL_SOUND_STYLES: SoundStyle[] = [
  'voice',
  'beep',
  'double_beep',
  'ascending_chime',
  'bell',
  'buzz',
  'click',
  'long_beep',
  'triple_tone',
  'none',
];

export interface SoundSettings {
  warmUpStart: SoundStyle;
  workStart: SoundStyle;
  restStart: SoundStyle;
  recoveryStart: SoundStyle;
  coolDownStart: SoundStyle;
  workoutComplete: SoundStyle;
  halfwaySound: SoundStyle;
  countdownDuration: number;
  /** This app's cue loudness, 0–100 percent of the phone's own volume. Applies
   *  to tones and spoken cues alike; other apps' audio is never touched. */
  volume: number;
}

/** The per-event cue keys (each holds a SoundStyle). */
export type SoundEventKey = Exclude<keyof SoundSettings, 'countdownDuration' | 'volume'>;

export interface AppSettings {
  sounds: SoundSettings;
  audioAccessibilityMode: boolean;
}

export type WorkoutPhase =
  | 'initial_countdown'
  | 'warm_up'
  | 'exercise'
  | 'rest'
  | 'recovery'
  | 'cool_down'
  | 'amrap'
  | 'for_time'
  | 'complete';

export interface PhaseStep {
  phase: WorkoutPhase;
  duration: number;
  setNumber?: number;
  cycleNumber?: number;
  /** A user-given interval name (custom sequences). Shown on screen, on the
   *  Lock Screen / notification, and spoken in place of the phase name. */
  label?: string;
  /** Count-up step (For Time): the screen shows elapsed time, not remaining. */
  countUp?: boolean;
  /** Built from a custom sequence: `setNumber` is the position in the list
   *  (work and rest alike) and `cycleNumber` the round. */
  inSequence?: boolean;
}

export type RootStackParamList = {
  TimerList: undefined;
  TimerEditor: { timerId?: string; kind?: TimerKind };
  ActiveWorkout: { timerId: string };
  Settings: undefined;
  Acknowledgements: undefined;
};
