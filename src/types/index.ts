export interface TimerConfig {
  id: string;
  name: string;
  initialCountdown: number;
  warmUp: number;
  exercise: number;
  rest: number;
  sets: number;
  recovery: number;
  cycles: number;
  coolDown: number;
  createdAt: number;
  updatedAt: number;
}

export type SoundStyle =
  | 'beep'
  | 'double_beep'
  | 'ascending_chime'
  | 'bell'
  | 'buzz'
  | 'long_beep'
  | 'triple_tone'
  | 'none';

export const SOUND_STYLE_LABELS: Record<SoundStyle, string> = {
  beep: 'Beep',
  double_beep: 'Double Beep',
  ascending_chime: 'Ascending Chime',
  bell: 'Bell',
  buzz: 'Buzz',
  long_beep: 'Long Beep',
  triple_tone: 'Triple Tone',
  none: 'None',
};

export const ALL_SOUND_STYLES: SoundStyle[] = [
  'beep',
  'double_beep',
  'ascending_chime',
  'bell',
  'buzz',
  'long_beep',
  'triple_tone',
  'none',
];

export interface SoundSettings {
  countdownTick: SoundStyle;
  warmUpStart: SoundStyle;
  workStart: SoundStyle;
  restStart: SoundStyle;
  recoveryStart: SoundStyle;
  coolDownStart: SoundStyle;
  workoutComplete: SoundStyle;
  countdownDuration: number;
}

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
  | 'complete';

export interface PhaseStep {
  phase: WorkoutPhase;
  duration: number;
  setNumber?: number;
  cycleNumber?: number;
}

export type RootStackParamList = {
  TimerList: undefined;
  TimerEditor: { timerId?: string };
  ActiveWorkout: { timerId: string };
  Settings: undefined;
};
