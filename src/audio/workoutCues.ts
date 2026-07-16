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
import { PhaseStep, SoundSettings, WorkoutPhase } from '../types';
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
};

export function speakAndReactivate(phrase: string): void {
  Speech.stop();
  Speech.speak(phrase, {
    language: 'en-US',
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
  const styleMap: Partial<Record<WorkoutPhase, keyof SoundSettings>> = {
    warm_up: 'warmUpStart',
    exercise: 'workStart',
    rest: 'restStart',
    recovery: 'recoveryStart',
    cool_down: 'coolDownStart',
    initial_countdown: 'warmUpStart',
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
    playSoundOrVoice(style, VOICE_PHASE_PHRASES[step.phase] ?? '');
    if (speechMode) {
      speakAndReactivate(buildPhaseAnnouncement(step, totalSetsInCycle, maxCycles));
    }
  }
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

export function getTotalSets(steps: PhaseStep[], current: PhaseStep): number {
  if (current.cycleNumber == null) return 0;
  return steps.filter(
    (s) => s.phase === 'exercise' && s.cycleNumber === current.cycleNumber
  ).length;
}

export function getMaxCycles(steps: PhaseStep[]): number {
  return steps.reduce((max, s) => Math.max(max, s.cycleNumber ?? 0), 0);
}
