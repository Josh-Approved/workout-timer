// Public types for @josh-approved/live-timer.
// Cross-platform contract: same shape backs an iOS Live Activity and an
// Android foreground-service notification.

export type LiveTimerPhase = {
  // Stable identifier for the phase, surfaced in action callbacks.
  id: string;
  // Short label rendered prominently (e.g. "Work", "Rest").
  label: string;
  // Phase length in seconds. The system renders the countdown itself —
  // the app does not tick this value down by hand.
  durationSeconds: number;
  // Count UP from the phase start instead of down to its end (a stopwatch
  // phase, e.g. For Time). Defaults to false (countdown).
  countsUp?: boolean;
};

export type LiveTimerActionId = 'pause' | 'resume' | 'skip' | 'stop';

export type LiveTimerStartInput = {
  // Stable identifier for the whole workout/session. Used to update or end it.
  sessionId: string;
  // Title shown above the countdown (e.g. "Tabata — Round 3 of 8").
  title: string;
  // Ordered list of phases. The active phase is index 0; subsequent
  // phases are queued so the system can transition without an app wake.
  phases: LiveTimerPhase[];
  // Wall-clock start time of the active phase, ms since epoch.
  // Used so iOS Text(timerInterval:) renders accurately even with
  // the app suspended.
  phaseStartMs: number;
  // Which actions to surface as buttons.
  actions: LiveTimerActionId[];
};

export type LiveTimerUpdateInput = {
  sessionId: string;
  // Patch fields. Anything omitted stays as last set.
  title?: string;
  phases?: LiveTimerPhase[];
  phaseStartMs?: number;
  actions?: LiveTimerActionId[];
};

export type LiveTimerEvent =
  | { type: 'action'; sessionId: string; action: LiveTimerActionId }
  | { type: 'dismissed'; sessionId: string }
  | { type: 'phaseTransition'; sessionId: string; toPhaseId: string }
  /** A wake armed with `wakeAfter` came due (Android; see index.ts). */
  | { type: 'wake'; id: string };

export type LiveTimerAvailability = {
  // True if the platform supports a persistent on-screen timer at all
  // (iOS 16.1+, Android 8+).
  supported: boolean;
  // True if the user/system currently allows it (iOS Live Activities
  // toggle on, Android notifications permitted).
  enabled: boolean;
  // Platform-specific reason when not enabled, for diagnostics.
  reason?: string;
};

// What the phone will do with the app's sound right now. Diagnostics only:
// the app logs it so "I hear nothing" can be told apart from "nothing played".
export type AudioOutput = {
  // The phone's media volume, 0–1 (0 when muted).
  volume: number;
  // Where the sound goes: speaker, earpiece, headphones, bluetooth, airplay,
  // car, usb, hdmi, none or other.
  output: string;
  // Another app is playing sound too (iOS only; null where unknown).
  otherAudio: boolean | null;
};
