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
  | { type: 'phaseTransition'; sessionId: string; toPhaseId: string };

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
