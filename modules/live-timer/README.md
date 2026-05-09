# @josh-approved/live-timer

A persistent on-screen timer for Josh Approved apps. One pinned component
that updates in place — never a stream of notifications.

- **iOS:** ActivityKit Live Activity (lock screen + Dynamic Island)
- **Android:** Foreground service with an ongoing notification

System-rendered countdown so the app does not have to be awake. No push
service, no server, no recurring cost.

## Audio while locked

The visual layer (Live Activity / foreground notification) is one component.
Beep cues at interval boundaries play through a **background audio session**,
not a notification stream. That entitlement is enabled by this module's
config plugin (iOS `UIBackgroundModes: audio`, Android
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`). Apps reuse their existing audio
engine; this module never plays sound itself.

## Install

In a host app:

```jsonc
// package.json
{
  "dependencies": {
    "@josh-approved/live-timer": "file:../josh-approved-factory/modules/live-timer"
  }
}
```

```jsonc
// app.json -> expo.plugins
[
  "@josh-approved/live-timer",
  {
    "widgetDisplayName": "Free Workout Timer"
  }
]
```

Then `npx expo prebuild --clean` and rebuild via EAS.

## Usage

```ts
import {
  startLiveTimer,
  updateLiveTimer,
  endLiveTimer,
  useLiveTimerEvents,
  useLiveTimerAvailability,
} from '@josh-approved/live-timer';

const availability = useLiveTimerAvailability();

useLiveTimerEvents((e) => {
  if (e.type === 'action' && e.action === 'pause') pauseWorkout();
  if (e.type === 'action' && e.action === 'skip') nextPhase();
});

await startLiveTimer({
  sessionId: workoutId,
  title: 'Tabata - Round 3 of 8',
  phases: [
    { id: 'work-3', label: 'Work', durationSeconds: 20 },
    { id: 'rest-3', label: 'Rest', durationSeconds: 10 },
  ],
  phaseStartMs: Date.now(),
  actions: ['pause', 'skip'],
});

// On every phase boundary (work -> rest etc), call update with the new
// active phase. The Live Activity reflows in place.
await updateLiveTimer({
  sessionId: workoutId,
  phases: [
    { id: 'rest-3', label: 'Rest', durationSeconds: 10 },
    { id: 'work-4', label: 'Work', durationSeconds: 20 },
  ],
  phaseStartMs: Date.now(),
});

await endLiveTimer(workoutId);
```

## Permissions

- **iOS:** no runtime prompt. Live Activities default ON; the system shows
  a per-app toggle in Settings. `getAvailability()` reflects current state.
- **Android:** uses the host app's existing `POST_NOTIFICATIONS` grant
  (workout audio cues already require it). No new prompt.

## Per-app customization

The lock screen / Dynamic Island layout (iOS) lives in
`plugin/ios-template/LiveTimerWidget.swift` and is copied into each
consuming app's iOS project on first prebuild. Apps customize that file
to match their visual language. The data contract (`LiveTimerAttributes`)
is shared and should not be edited per-app.

The Android notification layout uses the system base layout with custom
content/title/actions. To deviate further, override the notification
builder in a host-app subclass of `LiveTimerService` (advanced).

## Limits

- iOS Live Activities require iOS 16.1+. `getAvailability()` returns
  `supported: false` on older versions; apps should fall back gracefully.
- Action buttons currently use deep links; tapping a button opens the host
  app to handle the action. iOS 17+ `LiveActivityIntent` for in-place
  handling is a planned upgrade.
- Apple imposes a ~12-hour ceiling on a single Live Activity. Workouts
  longer than that should chain sessions.
