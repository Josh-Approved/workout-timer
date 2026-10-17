import {
  TimerConfig,
  PhaseStep,
  WorkoutPhase,
  SequenceInterval,
  IntervalKind,
  timerKind,
} from '../types';

/**
 * An uncapped For Time plays as one count-up step this long (24 hours). The
 * engine is countdown-based, so "no cap" is modelled as a cap nobody reaches;
 * the screen, list and Lock Screen all treat such a step as open-ended.
 */
export const FOR_TIME_OPEN_SECONDS = 24 * 60 * 60;

export function buildWorkoutSequence(timer: TimerConfig): PhaseStep[] {
  switch (timerKind(timer)) {
    case 'sequence':
      return buildSequenceSteps(timer);
    case 'amrap':
      return buildAmrapSteps(timer);
    case 'for_time':
      return buildForTimeSteps(timer);
    default:
      return buildIntervalSteps(timer);
  }
}

/** The classic shape: warm-up, work/rest × sets × cycles, recovery, cool-down. */
function buildIntervalSteps(timer: TimerConfig): PhaseStep[] {
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

/**
 * A custom sequence plays exactly what the user built: every interval with a
 * positive duration, in order, the whole list `repeats` times, framed by the
 * optional countdown / warm-up / cool-down. Each interval keeps its name as
 * the step label (spoken and shown), its position as `setNumber`, and its
 * round as `cycleNumber`. Nothing is dropped or reordered — a trailing rest
 * the user added is played.
 */
function buildSequenceSteps(timer: TimerConfig): PhaseStep[] {
  const steps: PhaseStep[] = [];
  const intervals = (timer.intervals ?? []).filter((iv) => iv.duration > 0);
  const repeats = Math.max(1, Math.floor(timer.repeats ?? 1));

  if (timer.initialCountdown > 0) {
    steps.push({ phase: 'initial_countdown', duration: timer.initialCountdown });
  }
  if (timer.warmUp > 0) {
    steps.push({ phase: 'warm_up', duration: timer.warmUp });
  }

  if (intervals.length > 0) {
    for (let round = 1; round <= repeats; round++) {
      intervals.forEach((iv, i) => {
        const name = iv.name.trim();
        steps.push({
          phase: iv.kind === 'rest' ? 'rest' : 'exercise',
          duration: iv.duration,
          setNumber: i + 1,
          cycleNumber: round,
          inSequence: true,
          ...(name ? { label: name } : {}),
        });
      });
    }
  }

  if (timer.coolDown > 0) {
    steps.push({ phase: 'cool_down', duration: timer.coolDown });
  }
  return steps;
}

/** AMRAP: the optional get-ready countdown, then one block of `timeCap` seconds. */
function buildAmrapSteps(timer: TimerConfig): PhaseStep[] {
  const steps: PhaseStep[] = [];
  if (timer.initialCountdown > 0) {
    steps.push({ phase: 'initial_countdown', duration: timer.initialCountdown });
  }
  const cap = Math.floor(timer.timeCap ?? 0);
  if (cap > 0) steps.push({ phase: 'amrap', duration: cap });
  return steps;
}

/** For Time: the optional countdown, then one count-up block — to the cap, or open-ended. */
function buildForTimeSteps(timer: TimerConfig): PhaseStep[] {
  const steps: PhaseStep[] = [];
  if (timer.initialCountdown > 0) {
    steps.push({ phase: 'initial_countdown', duration: timer.initialCountdown });
  }
  const cap = Math.floor(timer.timeCap ?? 0);
  steps.push({
    phase: 'for_time',
    duration: cap > 0 ? cap : FOR_TIME_OPEN_SECONDS,
    countUp: true,
  });
  return steps;
}

/** True when the timer has no finish time of its own (an uncapped For Time). */
export function isOpenEnded(timer: TimerConfig): boolean {
  return timerKind(timer) === 'for_time' && !((timer.timeCap ?? 0) > 0);
}

/** True for the two tap-to-count-rounds modes. */
export function hasRoundCounter(timer: Pick<TimerConfig, 'kind'>): boolean {
  const k = timerKind(timer);
  return k === 'amrap' || k === 'for_time';
}

/** A fresh interval for the sequence editor. */
export function newSequenceInterval(
  name: string,
  duration: number,
  kind: IntervalKind,
): SequenceInterval {
  return { id: generateId(), name, duration, kind };
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
  switch (timerKind(timer)) {
    case 'sequence': {
      const count = (timer.intervals ?? []).length;
      const repeats = Math.max(1, timer.repeats ?? 1);
      const parts = [`${count} interval${count !== 1 ? 's' : ''}`];
      if (repeats > 1) parts.push(`${repeats} rounds`);
      return parts.join(' · ');
    }
    case 'amrap':
      return `AMRAP · ${dur(timer.timeCap ?? 0)}`;
    case 'for_time': {
      const cap = timer.timeCap ?? 0;
      return cap > 0 ? `For time · ${dur(cap)} cap` : 'For time · no cap';
    }
    default: {
      const parts: string[] = [`${dur(timer.exercise)} work`];
      if (timer.rest > 0) parts.push(`${dur(timer.rest)} rest`);
      parts.push(`${timer.sets} set${timer.sets !== 1 ? 's' : ''}`);
      if (timer.cycles > 1) parts.push(`${timer.cycles} cycles`);
      return parts.join(' · ');
    }
  }
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
    amrap: 'AMRAP',
    for_time: 'For time',
    complete: 'Workout complete',
  };

  const dur = formatDurationSpoken(step.duration);

  // A named interval (custom sequence) is announced by its own name, with its
  // round when the list repeats. Position within the list is not spoken — the
  // name already tells the user where they are.
  if (step.label) {
    const roundCtx =
      maxCycles > 1 && step.cycleNumber != null ? `, round ${step.cycleNumber} of ${maxCycles}` : '';
    return `${step.label}${roundCtx}, ${dur}`;
  }

  const name = PHASE_SPOKEN[step.phase];

  if (step.phase === 'for_time') {
    return step.duration >= FOR_TIME_OPEN_SECONDS ? name : `${name}, ${dur} cap`;
  }

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
