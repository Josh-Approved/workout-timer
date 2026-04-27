import { TimerConfig, PhaseStep, WorkoutPhase } from '../types';

export function buildWorkoutSequence(timer: TimerConfig): PhaseStep[] {
  const steps: PhaseStep[] = [];

  if (timer.initialCountdown > 0) {
    steps.push({ phase: 'initial_countdown', duration: timer.initialCountdown });
  }

  if (timer.warmUp > 0) {
    steps.push({ phase: 'warm_up', duration: timer.warmUp });
  }

  for (let cycle = 1; cycle <= timer.cycles; cycle++) {
    for (let set = 1; set <= timer.sets; set++) {
      steps.push({
        phase: 'exercise',
        duration: timer.exercise,
        setNumber: set,
        cycleNumber: cycle,
      });

      const isLastSet = set === timer.sets;
      const isLastCycle = cycle === timer.cycles;
      if (timer.rest > 0 && !(isLastSet && isLastCycle)) {
        steps.push({
          phase: 'rest',
          duration: timer.rest,
          setNumber: set,
          cycleNumber: cycle,
        });
      }
    }

    if (timer.recovery > 0 && cycle < timer.cycles) {
      steps.push({ phase: 'recovery', duration: timer.recovery, cycleNumber: cycle });
    }
  }

  if (timer.coolDown > 0) {
    steps.push({ phase: 'cool_down', duration: timer.coolDown });
  }

  return steps;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getTotalDuration(timer: TimerConfig): number {
  return buildWorkoutSequence(timer).reduce((sum, s) => sum + s.duration, 0);
}

export function getTimerSummary(timer: TimerConfig): string {
  const dur = (n: number) =>
    n < 60 ? `${n} second${n !== 1 ? 's' : ''}` : `${Math.floor(n / 60)} min`;
  const parts: string[] = [`${dur(timer.exercise)} work`];
  if (timer.rest > 0) parts.push(`${dur(timer.rest)} rest`);
  parts.push(`${timer.sets} set${timer.sets !== 1 ? 's' : ''}`);
  if (timer.cycles > 1) parts.push(`${timer.cycles} cycles`);
  return parts.join(' · ');
}

export function formatDurationSpoken(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const mins = `${m} minute${m !== 1 ? 's' : ''}`;
  if (s === 0) return mins;
  return `${mins} and ${s} second${s !== 1 ? 's' : ''}`;
}

export function buildPhaseAnnouncement(
  step: PhaseStep,
  totalSetsInCycle: number,
  maxCycles: number,
): string {
  const PHASE_SPOKEN: Record<WorkoutPhase, string> = {
    initial_countdown: 'Get ready',
    warm_up: 'Warm up',
    exercise: 'Exercise',
    rest: 'Rest',
    recovery: 'Recovery',
    cool_down: 'Cool down',
    complete: 'Workout complete',
  };

  const name = PHASE_SPOKEN[step.phase];
  const dur = formatDurationSpoken(step.duration);

  if ((step.phase === 'exercise' || step.phase === 'rest') && step.setNumber != null && totalSetsInCycle > 0) {
    const setCtx = `set ${step.setNumber} of ${totalSetsInCycle}`;
    const cycCtx = maxCycles > 1 && step.cycleNumber != null ? `, cycle ${step.cycleNumber} of ${maxCycles}` : '';
    return `${name}, ${setCtx}${cycCtx}, ${dur}`;
  }

  if (step.phase === 'recovery' && step.cycleNumber != null && maxCycles > 1) {
    return `${name}, after cycle ${step.cycleNumber} of ${maxCycles}, ${dur}`;
  }

  return `${name}, ${dur}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
