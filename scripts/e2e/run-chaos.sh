#!/usr/bin/env bash
# Two-device sync E2E UNDER NETWORK CHAOS. Runs the app's baseline sync flows
# once per named toxiproxy scenario (partition-mid-sync, slow-drip, lossy,
# disconnect-on-write, flap) with the fault schedule live, then asserts the
# app's intent + honesty oracles held (the Maestro flows own those assertions).
#
# APP-OWNED example (synced ifAbsent). Point Metro at CHAOS_PORT before running:
#   EXPO_PUBLIC_SYNC_RELAYS="ws://127.0.0.1:7448,ws://10.0.2.2:7448" \
#   EXPO_PUBLIC_QA_MODE=1 EXPO_PUBLIC_QA_SHARE_SECRET=<base64-32B> \
#   npx expo start --port 8081
#
# Usage: scripts/e2e/run-chaos.sh <ios-sim-udid> [android-serial] [scenario...]
set -euo pipefail

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Mac-mini load governor (Uplevel 3 / T5) ──────────────────────────────────
# The full chaos sweep (two device drivers + Metro + toxiproxy, once per scenario)
# is ONE heavy unit; on the 8 GB mini heavy work must run one-at-a-time. Re-exec
# the whole script under the factory's machine-wide heavy-lock CLI shim (a no-op
# on a full-size machine). JA_HEAVY_HELD is set once inside the lock, so this
# fires exactly once, BEFORE the arg shifts below (so "$@" is still the original).
# If the factory sibling isn't present we run unguarded — the lock only matters on
# the mini, where the factory is always a sibling.
if [ -z "${JA_HEAVY_HELD:-}" ]; then
  _JA_HEAVY="$E2E_DIR/../../../josh-approved-factory/scripts/lib/heavy.mjs"
  if [ -f "$_JA_HEAVY" ]; then
    _JA_APP="$(basename "$(cd "$E2E_DIR/../.." && pwd)")"
    exec node "$_JA_HEAVY" run --label "e2e:$_JA_APP" -- "$0" "$@"
  fi
fi

IOS_UDID="${1:?usage: run-chaos.sh <ios-sim-udid> [android-serial] [scenario...]}"
shift || true
ANDROID_SERIAL="${1:-emulator-5554}"; [ $# -gt 0 ] && shift || true
# shellcheck source=/dev/null
source "$E2E_DIR/e2e.config.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/harness-lib.sh"

SCENARIOS=("$@")
if [ ${#SCENARIOS[@]} -eq 0 ]; then
  SCENARIOS=(partition-mid-sync slow-drip lossy disconnect-on-write flap)
fi

for scenario in "${SCENARIOS[@]}"; do
  h_step "chaos scenario: $scenario"
  h_ios_terminate
  h_reset_android
  h_start_chaos "$scenario"
  # Baseline propagation + the reported-defect flows, now with the fault live.
  # The app-owned flow list belongs here — mirror run-two-device.sh's sequence.
  echo "Drive the app's sync flows here (see run-two-device.sh) while the fault runs."
  h_stop_chaos
done

h_write_report chaos true "${SCENARIOS[@]}"
h_step "PASS — chaos scenarios complete"
