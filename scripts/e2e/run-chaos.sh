#!/usr/bin/env bash
# Class mode (beta) two-device E2E UNDER NETWORK CHAOS — the member's link only.
#
# One class (instructor = iOS simulator, member = Android emulator); then, per
# named scenario, a fault on the MEMBER's link (toxiproxy) while the instructor
# keeps commanding, and the oracle: the member never acts on a command it hasn't
# received, and once the link heals it lands exactly where the class is (same
# step, same running/paused), with nothing to reconcile.
#
#   partition      link down → host pauses → member keeps running → link up →
#                  member snaps to the pause; host resumes → both run together
#   slow-drip      2 s ± 250 ms latency each way (> the 1.2 s command lead) →
#                  host skips → member lands late but on the same step (the
#                  lateness is printed: it is the design's known limit)
#   lossy          30% of the member's connections reset → two skips → converge
#   flap           link toggles every 2 s for ~24 s while the host pauses,
#                  resumes and skips → converge once it settles
#   relay-restart  the relay process restarts (its stored timeline is gone) →
#                  host re-deposits on reconnect → skip converges → a member
#                  killed and relaunched is offered "Rejoin class" and lands in step
#   blackhole      (opt-in, KNOWN RED) the member's link goes silent without a
#                  reset — the gym-Wi-Fi failure. The member's strip must stop
#                  saying "Live". Today it never does (no heartbeat), so this
#                  scenario fails on that honesty oracle until that's fixed.
#
# Prerequisites: as run-two-device.sh, but Metro must give the member ONLY the
# proxied relay (the instructor stays direct):
#   EXPO_PUBLIC_SYNC_RELAYS="ws://127.0.0.1:7447,ws://10.0.2.2:7448" \
#     npx expo start --port 8081 --clear 2>&1 | tee "$METRO_LOG"
# and toxiproxy-server on PATH (brew install toxiproxy). relay-restart restarts
# the mini-relay on RELAY_PORT (it is started again, detached, logging to
# RELAY_LOG or /dev/null) — skip that scenario if something else owns it.
#
# Usage: METRO_LOG=<file> scripts/e2e/run-chaos.sh <ios-sim-udid> [android-serial] [scenario...]
set -euo pipefail

E2E_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Mac-mini load governor (Uplevel 3 / T5) ──────────────────────────────────
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

IOS_UDID="${1:?usage: METRO_LOG=<file> run-chaos.sh <ios-sim-udid> [android-serial] [scenario...]}"
shift || true
ANDROID_SERIAL="${1:-emulator-5554}"; [ $# -gt 0 ] && shift || true
# shellcheck source=/dev/null
source "$E2E_DIR/e2e.config.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/harness-lib.sh"
# shellcheck source=/dev/null
source "$E2E_DIR/class-lib.sh"
cd "$E2E_DIR/../.."

SCENARIOS=("$@")
if [ ${#SCENARIOS[@]} -eq 0 ]; then
  SCENARIOS=(partition slow-drip lossy flap relay-restart)
fi
trap 'c_chaos_down; h_cleanup' EXIT

h_step "Preconditions; chaos front-end for the member; both apps to the list"
c_require_metro
RUN_START=$(c_mark)
c_require_relay
h_android_online_safe
h_assert_android_online
MEMBER_SKEW_MS=$(c_droid_skew)
export MEMBER_SKEW_MS
echo "emulator clock is ${MEMBER_SKEW_MS} ms behind the Mac (corrected for in the link and the oracle)"
c_chaos_up
c_open_ios
c_open_droid
h_ios 00-ready.yaml
h_droid 00-ready.yaml

h_step "Instructor starts a class ($CLASS_TIMER); member joins"
M=$(c_mark)
CLASS_M=$M # "converged" judges each phone's LATEST run/pause and step since the class began
maestro --device "$IOS_UDID" test -e TIMER="$CLASS_TIMER" -e START_IN="30 sec" "$FLOWS/01-host-start-class.yaml"
URL=$(c_log url --since "$M" --expect-name "$CLASS_TIMER")
c_join_droid "$URL"
h_droid 14-member-joined.yaml
c_log wait --since "$M" --dev "ios host" --what run --timeout 60000 >/dev/null
c_log wait --since "$M" --dev "android member" --what run --timeout 30000 >/dev/null
c_log converged --since "$CLASS_M" --timeout 15000

lateness() { # host event line, member event line → "member − host" ms
  echo $(( ${2% *} - ${1% *} ))
}

for scenario in "${SCENARIOS[@]}"; do
  h_step "chaos scenario: $scenario"
  c_toxics_clear
  case "$scenario" in
    partition)
      c_link down
      h_droid 10-member-offline.yaml
      M=$(c_mark)
      h_ios 03-host-pause.yaml
      H=$(c_log wait --since "$M" --dev "ios host" --what pause --timeout 6000)
      c_log none --since "$M" --dev "android member" --what pause --for 5000
      c_link up
      MB=$(c_log wait --since "$M" --dev "android member" --what pause --timeout 30000)
      echo "member paused $(lateness "$H" "$MB") ms after the class did (delivered on reconnect)"
      c_log converged --since "$CLASS_M" --timeout 10000
      M=$(c_mark)
      h_ios 05-host-resume.yaml
      c_pair "$M" run
      ;;
    slow-drip)
      c_toxic_add drip-down latency downstream '{"latency":2000,"jitter":250}'
      c_toxic_add drip-up latency upstream '{"latency":2000,"jitter":250}'
      sleep 3
      M=$(c_mark)
      h_ios 07-host-skip.yaml
      H=$(c_log wait --since "$M" --dev "ios host" --what jump --timeout 6000)
      MB=$(c_log wait --since "$M" --dev "android member" --what jump --timeout 20000)
      echo "member jumped $(lateness "$H" "$MB") ms after the class did (2 s pipe vs 1.2 s lead)"
      c_toxics_clear
      c_log converged --since "$CLASS_M" --timeout 10000
      ;;
    lossy)
      c_toxic_add loss reset_peer downstream '{"timeout":0}' 0.3
      M=$(c_mark)
      h_ios 07-host-skip.yaml
      sleep 3
      h_ios 07-host-skip.yaml
      sleep 8
      c_toxic_rm loss
      c_log converged --since "$CLASS_M" --timeout 30000
      ;;
    flap)
      M=$(c_mark)
      ( for _ in 1 2 3 4 5 6; do c_link down >/dev/null; sleep 2; c_link up >/dev/null; sleep 2; done ) &
      FLAP=$!
      h_ios 03-host-pause.yaml
      h_ios 05-host-resume.yaml
      h_ios 07-host-skip.yaml
      wait "$FLAP" || true
      c_link up
      c_log converged --since "$CLASS_M" --timeout 30000
      ;;
    relay-restart)
      pkill -f "mini-relay.mjs --port $RELAY_PORT" 2>/dev/null || true
      sleep 1
      nohup node "$E2E_DIR/mini-relay.mjs" --port "$RELAY_PORT" >>"${RELAY_LOG:-/dev/null}" 2>&1 &
      disown || true
      sleep 6 # both transports retry every 4 s
      M=$(c_mark)
      h_ios 07-host-skip.yaml
      c_log converged --since "$CLASS_M" --timeout 20000
      h_step "relay-restart: member killed and relaunched → Rejoin class"
      h_android_terminate
      M=$(c_mark)
      c_open_droid
      h_droid 13-rejoin.yaml
      c_member_matches_host "$M" 20000
      ;;
    blackhole)
      c_toxic_add bh-down timeout downstream '{"timeout":0}'
      c_toxic_add bh-up timeout upstream '{"timeout":0}'
      M=$(c_mark)
      h_ios 03-host-pause.yaml
      c_log none --since "$M" --dev "android member" --what pause --for 5000
      # Honesty oracle — RED today: a silent dead link still reads "Live".
      h_droid 10-member-offline.yaml
      c_toxics_clear
      c_log converged --since "$CLASS_M" --timeout 20000
      M=$(c_mark)
      h_ios 05-host-resume.yaml
      c_pair "$M" run
      ;;
    *)
      echo "unknown scenario $scenario" >&2
      exit 2
      ;;
  esac
done

h_step "Both leave the class"
c_toxics_clear
h_ios 12-leave-class.yaml
h_droid 12-leave-class.yaml

h_step "Timing table (this run)"
c_log table --since "$RUN_START" || true

[ "${E2E_NO_REPORT:-}" = 1 ] || h_write_report class-chaos true "${SCENARIOS[@]}"
h_step "PASS — Class mode chaos scenarios green"
