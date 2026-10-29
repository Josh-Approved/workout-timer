#!/usr/bin/env bash
# Per-app config for the two-device E2E. APP-OWNED (synced ifAbsent — never
# clobbered on re-sync, same as src/sync/shareConfig.ts). The shared
# harness-lib.sh and this app's class-lib.sh read them.
#
# Workout Timer's two-device suite covers Class mode (beta): the instructor on
# the iOS simulator, a member on the Android emulator, one class, and the
# `[class] …` timing lines both phones log to Metro (class-log.mjs).
#
# Sourced by run-two-device.sh / run-chaos.sh.

# This app's iOS + Android bundle id.
APP_ID="com.joshapproved.freeworkouttimer"

# Debug APK (relative to the app repo root). Only used if you choose to
# reinstall; the class suite keeps the installed debug build (a reinstall
# brings back the dev client's first-run sheet and the notification prompt).
ANDROID_APK="android/app/build/outputs/apk/debug/app-debug.apk"

# Absolute dir of this app's Maestro flows for the two-device suite.
FLOWS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../qa/flows/e2e-sync" && pwd)"

# Ports: mini-relay (hermetic) + toxiproxy chaos front-end (member's link only).
RELAY_PORT="${RELAY_PORT:-7447}"
CHAOS_PORT="${CHAOS_PORT:-7448}"

# The file Metro's output is tee'd into. Every phone's console reaches Metro
# in a dev build, which is where the class timing lines are read from:
#   EXPO_PUBLIC_SYNC_RELAYS=… npx expo start --port 8081 --clear 2>&1 | tee "$METRO_LOG"
METRO_LOG="${METRO_LOG:-}"

# Dev client deep link that loads the bundle from Metro (8081, adb-reversed on Android).
DEV_CLIENT_URL="exp+free-workout-timer://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"

# Which saved timer the instructor runs, and how far out the class starts.
# "1 min" leaves room for the member to join before the start.
CLASS_TIMER="${CLASS_TIMER:-Standard Tabata}"
CLASS_START_IN="${CLASS_START_IN:-1 min}"

# Phones within this many ms of each other count as "in step" (target ~100 ms;
# the gate is looser so emulator scheduling noise doesn't flake it).
TOL_MS="${TOL_MS:-250}"
