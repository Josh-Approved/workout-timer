#!/usr/bin/env bash
# Two-device (iOS simulator + Android emulator) live sync E2E — BASELINE.
#
# APP-OWNED orchestration (synced ifAbsent). This generic skeleton sources the
# shared harness-lib.sh; replace the flow sequence with THIS app's flows (see
# grocery-list/scripts/e2e/run-two-device.sh for the worked, 11-flow example).
#
# Prerequisites (the authoring session runs these by hand):
#   - mini-relay:  node scripts/e2e/mini-relay.mjs --port 7447
#   - Metro:       EXPO_PUBLIC_SYNC_RELAYS="ws://127.0.0.1:7447,ws://10.0.2.2:7447" \
#                  EXPO_PUBLIC_QA_MODE=1 EXPO_PUBLIC_QA_SHARE_SECRET=<base64-32B> \
#                  npx expo start --port 8081 --clear
#     --clear IS NOT OPTIONAL. Metro caches the transformed bundle, and a cached
#     bundle from an earlier non-QA start has EXPO_PUBLIC_QA_MODE inlined as
#     absent — the app then boots to an EMPTY list with no fixtures and the
#     suite fails on its first assertion, which reads exactly like a sync
#     defect. Confirm inlining before running: fetch the bundle and grep for
#     the share secret, the relay URL and QA_MODE. (Cost a wasted run 2026-08-25.)
#   - Debug app installed on both: npx expo run:ios / run:android --no-bundler
#     `run:android --device` wants the AVD NAME (e.g. aosp_nogms), NOT the adb
#     serial (emulator-5554) — it rejects the serial outright. The serial is what
#     THIS script takes as arg 2; they are different identifiers for the same
#     emulator and swapping them is a silent time sink. `emulator -list-avds`
#     gives the names, `adb devices` gives the serials.
#   - The emulator's radios must actually be UP. A run that dies inside an
#     offline window leaves wlan0/eth0 DOWN and poisons the NEXT run, which then
#     fails at phase 1's "Connected" and reads exactly like a sync bug. The
#     harness repairs and then ASSERTS this (h_assert_android_online), so a dead
#     radio now names itself instead of costing a run — but if you are driving
#     the emulator by hand, restore it yourself:
#       adb -s <serial> shell svc wifi enable && adb -s <serial> shell svc data enable
#
# Usage: scripts/e2e/run-two-device.sh <ios-sim-udid> [android-serial]
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
if [ -z "${JA_HEAVY_HELD:-}" ]; then
  _JA_HEAVY="$E2E_DIR/../../../josh-approved-factory/scripts/lib/heavy.mjs"
  if [ -f "$_JA_HEAVY" ]; then
    _JA_APP="$(basename "$(cd "$E2E_DIR/../.." && pwd)")"
    exec node "$_JA_HEAVY" run --label "e2e:$_JA_APP" -- "$0" "$@"
  fi
fi

IOS_UDID="${1:?usage: run-two-device.sh <ios-sim-udid> [android-serial]}"
ANDROID_SERIAL="${2:-emulator-5554}"
# shellcheck source=/dev/null
source "$E2E_DIR/e2e.config.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/harness-lib.sh"

h_step "Reset both devices"
h_ios_terminate
h_reset_android

h_step "Drive this app's baseline sync flows"
# Replace with the app's flow sequence, e.g.:
#   h_droid 01-android-open.yaml
#   h_ios   02-ios-add.yaml
#   h_droid 03-android-verify-add.yaml
#   ...
echo "No flows wired yet — copy grocery-list/scripts/e2e/run-two-device.sh."

h_write_report baseline true two-device-baseline
h_step "PASS — baseline two-device sync green"
