/**
 * Audio / haptic / speech cues for the active workout — phase starts, halfway,
 * and completion. Extracted from ActiveWorkoutScreen so the cue rules (sound
 * style vs. voice, the speech accessibility mode) live next to the AudioEngine
 * they drive; the screen and its playback hook just call these at the right
 * moments.
 */

import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { PhaseStep, SoundEventKey, SoundSettings, WorkoutPhase } from '../types';
import { buildPhaseAnnouncement } from '../utils/workout';
import { AudioEngine } from './AudioEngine';
import { t } from '../i18n';

const VOICE_PHASE_PHRASES: Partial<Record<WorkoutPhase, string>> = {
  initial_countdown: 'Get Ready',
  warm_up: 'Warm Up',
  exercise: 'Exercise',
  rest: 'Rest',
  recovery: 'Recovery',
  cool_down: 'Cool Down',
  amrap: 'AMRAP',
  for_time: 'For Time',
};

export function speakAndReactivate(phrase: string): void {
  Speech.stop();
  if (AudioEngine.getVolume() === 0) return;
  Speech.speak(phrase, {
    language: 'en-US',
    volume: AudioEngine.getVolume(),
    onDone: () => { AudioEngine.reactivate().catch(() => {}); },
    onError: () => { AudioEngine.reactivate().catch(() => {}); },
  });
}

function playSoundOrVoice(style: string, voicePhrase: string): void {
  if (style === 'voice') {
    if (voicePhrase) speakAndReactivate(voicePhrase);
  } else if (style !== 'none') {
    AudioEngine.playSound(style as any).catch(() => {});
  }
}

export function firePhaseStart(
  step: PhaseStep,
  sounds: SoundSettings,
  allSteps: PhaseStep[],
  maxCycles: number,
  speechMode: boolean,
): void {
  const styleMap: Partial<Record<WorkoutPhase, SoundEventKey>> = {
    warm_up: 'warmUpStart',
    exercise: 'workStart',
    rest: 'restStart',
    recovery: 'recoveryStart',
    cool_down: 'coolDownStart',
    initial_countdown: 'warmUpStart',
    amrap: 'workStart',
    for_time: 'workStart',
  };
  const key = styleMap[step.phase];
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

  if (!key) return;

  const style = sounds[key] as string;
  const totalSetsInCycle =
    step.phase === 'exercise' || step.phase === 'rest' ? getTotalSets(allSteps, step) : 0;

  if (style === 'voice' && speechMode) {
    speakAndReactivate(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles));
  } else {
    // A named interval (custom sequence) is announced by its own name — that
    // is the whole point of naming it. Unnamed steps keep the phase word.
    playSoundOrVoice(style, step.label ?? VOICE_PHASE_PHRASES[step.phase] ?? '');
    if (speechMode) {
      speakAndReactivate(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles));
    }
  }
}

/**
 * The round counter's tap feedback (AMRAP / For Time): a click + haptic so a
 * tap registers eyes-free, and the new count spoken when voice cues are on.
 */
export function fireRoundCounted(round: number, speechMode: boolean): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  AccessibilityInfo.announceForAccessibility(t('workout.roundsA11y', { count: round }));
  if (speechMode) speakAndReactivate(`Round ${round}`);
  else AudioEngine.playSound('click').catch(() => {});
}

export function playComplete(sounds: SoundSettings, speechMode: boolean): void {
  const style = sounds.workoutComplete as string;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  AccessibilityInfo.announceForAccessibility(t('workout.complete'));

  if (style === 'voice' && speechMode) {
    speakAndReactivate('Workout complete');
  } else {
    playSoundOrVoice(style, 'Workout Complete');
    if (speechMode) speakAndReactivate('Workout complete');
  }
}

/**
 * How many positions the current step's cycle has: work sets for an interval
 * timer; every interval (work and rest alike) for a custom sequence, whose
 * steps all carry a position.
 */
export function getTotalSets(steps: PhaseStep[], current: PhaseStep): number {
  if (current.cycleNumber == null) return 0;
  if (current.inSequence) {
    return steps.filter(
      (s) => s.setNumber != null && s.cycleNumber === current.cycleNumber
    ).length;
  }
  return steps.filter(
    (s) => s.phase === 'exercise' && s.cycleNumber === current.cycleNumber
  ).length;
}

export function getMaxCycles(steps: PhaseStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.cycleNumber ?? 0), 0);
}
