#!/usr/bin/env bash
# Two-device (iOS simulator + Android emulator) Class mode (beta) E2E — BASELINE.
#
# APP-OWNED orchestration. The instructor (host) is the iOS simulator, a member
# is the Android emulator; one class, driven end to end:
#
#   start → member joins via link → both start at the same instant → both cross
#   the first boundary together → host pause → member paused → host resume →
#   both running → host skip → both on the same step → member steps out and
#   back in sync → member's app in the background (HOME): host pause, resume
#   and skip land together → member's screen off: the next boundary and a skip
#   land together → member's radios cut, host skips (member must NOT move) →
#   radios back → member snaps to the class's step → both leave.
#
# Every "together" is checked on the `wall=` stamps both phones log to Metro
# (class-log.mjs): same step, within TOL_MS (default 250 ms). The iOS simulator
# shares the Mac's clock; the Android emulator does NOT (2.2 s behind on
# 2026-10-25), so the runner measures that offset over adb and corrects both
# the member's link line-up and its stamps by it. What's measured is the sync
# machinery in real time — minus the camera-scan line-up, which only real
# phones can exercise.
#
# Prerequisites (run by hand; they're long-lived):
#   - mini-relay:  node scripts/e2e/mini-relay.mjs --port 7447
#   - Metro, tee'd to a file (the oracle reads it):
#       EXPO_PUBLIC_SYNC_RELAYS="ws://127.0.0.1:7447,ws://10.0.2.2:7447" \
#         npx expo start --port 8081 --clear 2>&1 | tee "$METRO_LOG"
#     --clear IS NOT OPTIONAL when the relay list changes: the value is inlined
#     into the cached bundle.
#   - Debug builds installed on both (npx expo run:ios / run:android).
#   - The instructor's phone has a saved timer named $CLASS_TIMER (default
#     "Standard Tabata", one of the app's starter timers).
#
# Usage: METRO_LOG=<file> scripts/e2e/run-two-device.sh <ios-sim-udid> [android-serial]
# Maestro drives ONE device at a time (two concurrent drivers destabilise RN).
set -euo pipefail

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Mac-mini load governor (Uplevel 3 / T5) ──────────────────────────────────
# This two-device run (two device drivers + Metro) is ONE heavy unit; on the 8 GB
# mini heavy work must run one-at-a-time. Re-exec the whole script under the
# factory's machine-wide heavy-lock CLI shim (a no-op on a full-size machine).
# JA_HEAVY_HELD is set once we're inside the lock, so this fires exactly once. If
# the factory sibling isn't present (app repo cloned alone) we run unguarded —
# the lock only matters on the mini, where the factory is always a sibling.
# _JA_HEAVY_REEXEC guards the re-exec itself: on a 'full' machine profile
# heavy.mjs runs the command WITHOUT setting JA_HEAVY_HELD, so checking that
# alone re-execs forever (a fork bomb — found 2026-10-25 on the studio Mac).
if [ -z "${JA_HEAVY_HELD:-}" ] && [ -z "${_JA_HEAVY_REEXEC:-}" ]; then
  _JA_HEAVY="$E2E_DIR/../../../josh-approved-factory/scripts/lib/heavy.mjs"
  if [ -f "$_JA_HEAVY" ]; then
    _JA_APP="$(basename "$(cd "$E2E_DIR/../.." && pwd)")"
    export _JA_HEAVY_REEXEC=1
    exec node "$_JA_HEAVY" run --label "e2e:$_JA_APP" -- "$0" "$@"
  fi
fi

IOS_UDID="${1:?usage: METRO_LOG=<file> run-two-device.sh <ios-sim-udid> [android-serial]}"
ANDROID_SERIAL="${2:-emulator-5554}"
# shellcheck source=/dev/null
source "$E2E_DIR/e2e.config.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/harness-lib.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/class-lib.sh"
cd "$E2E_DIR/../.."

h_step "0/11 Preconditions; both apps to the timer list"
c_require_metro
RUN_START=$(c_mark)
c_require_relay
h_android_online_safe
h_assert_android_online
MEMBER_SKEW_MS=$(c_droid_skew)
export MEMBER_SKEW_MS
echo "emulator clock is ${MEMBER_SKEW_MS} ms behind the Mac (corrected for in the link and the oracle)"
c_open_ios
c_open_droid
h_ios 00-ready.yaml
h_droid 00-ready.yaml

h_step "1/11 Instructor (iOS) starts a class: $CLASS_TIMER, starts in $CLASS_START_IN"
M=$(c_mark)
maestro --device "$IOS_UDID" test -e TIMER="$CLASS_TIMER" -e START_IN="$CLASS_START_IN" "$FLOWS/01-host-start-class.yaml"
URL=$(c_log url --since "$M" --expect-name "$CLASS_TIMER")
echo "class link: ${URL:0:60}…"

h_step "2/11 Member (Android) joins by the class link; start counts down"
c_join_droid "$URL"
h_droid 02-member-gathering.yaml

h_step "3/11 Both start at the class start, and cross the first boundary together"
c_pair "$M" run --step 0 --timeout 130000
c_pair "$M" at --step 1 --timeout 60000

h_step "4/11 Instructor pauses → member paused"
M=$(c_mark)
h_ios 03-host-pause.yaml
c_pair "$M" pause
h_droid 04-member-paused.yaml

h_step "5/11 Instructor resumes → both running again"
M=$(c_mark)
h_ios 05-host-resume.yaml
c_pair "$M" run
h_droid 06-member-running.yaml

h_step "6/11 Instructor skips → both on the same next step"
M=$(c_mark)
c_host_skip "$M"
c_pair "$M" jump

h_step "7/11 Member steps out, waits, comes back in sync"
h_droid 08-member-step-out.yaml
sleep 5
M=$(c_mark)
h_droid 09-member-back-in-sync.yaml
c_member_matches_host "$M"

h_step "8/11 Member's app in the background (HOME): pause, resume and skip still land together"
# Android stops JS timers for an app that isn't in front; the class must not.
c_droid_background
M=$(c_mark)
h_ios 03-host-pause.yaml
c_pair "$M" pause
M=$(c_mark)
h_ios 05-host-resume.yaml
c_pair "$M" run
M=$(c_mark)
c_host_skip "$M"
c_pair "$M" jump

h_step "9/11 Member's screen off: the next boundary and a skip still land together"
c_droid_screen off
M=$(c_mark)
c_pair "$M" at --timeout 70000
M=$(c_mark)
c_host_skip "$M"
c_pair "$M" jump
c_droid_screen on
c_droid_foreground
h_droid 06-member-running.yaml

h_step "10/11 Member offline: instructor's skip can't reach it; on reconnect it snaps to the class"
h_android_offline
h_droid 10-member-offline.yaml
M=$(c_mark)
c_host_skip "$M"
HOST_JUMP=$(c_log wait --since "$M" --dev "ios host" --what jump --timeout 6000)
echo "host skipped to step ${HOST_JUMP#* } @${HOST_JUMP% *}"
# The member keeps running on schedule; it must NOT have followed the skip.
c_log none --since "$M" --dev "android member" --what jump --for 5000
h_android_online
h_droid 11-member-online.yaml
c_member_matches_host "$M" 45000

h_step "11/11 Both leave the class"
h_ios 12-leave-class.yaml
h_droid 12-leave-class.yaml

h_step "Timing table (this run)"
c_log table --since "$RUN_START" || true

# The gate artifact (qa/e2e-sync-report.json). E2E_NO_REPORT=1 skips it for an
# exploratory run that shouldn't touch the gate.
[ "${E2E_NO_REPORT:-}" = 1 ] || h_write_report class-baseline true class-two-device-baseline
h_step "PASS — Class mode two-device baseline green"
