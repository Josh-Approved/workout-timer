#!/usr/bin/env bash
# Class mode (beta) helpers for the two-device E2E — APP-OWNED, sourced by
# run-two-device.sh / run-chaos.sh AFTER e2e.config.sh and harness-lib.sh.
#
# The instructor is the iOS simulator ($IOS_UDID), the member is the Android
# emulator ($ANDROID_SERIAL). Both are debug builds on Metro; their `[class]`
# timing lines are read from $METRO_LOG by class-log.mjs.

# shellcheck disable=SC2154

c_log() { node "$E2E_DIR/class-log.mjs" "$1" --log "$METRO_LOG" "${@:2}"; }
# A byte offset into the Metro log: "only what happens from here on".
c_mark() { c_log offset; }

# --- preconditions -----------------------------------------------------------
c_require_metro() {
  if ! curl -s "http://127.0.0.1:8081/status" | grep -q running; then
    echo "PRECONDITION FAILED: Metro is not running on :8081" >&2
    return 1
  fi
  if [ -z "${METRO_LOG:-}" ] || [ ! -f "$METRO_LOG" ]; then
    {
      echo "PRECONDITION FAILED: METRO_LOG must name the file Metro's output is tee'd into."
      echo "  e.g. EXPO_PUBLIC_SYNC_RELAYS=\"ws://127.0.0.1:$RELAY_PORT,ws://10.0.2.2:$RELAY_PORT\" \\"
      echo "         npx expo start --port 8081 --clear 2>&1 | tee /tmp/metro.log"
      echo "       METRO_LOG=/tmp/metro.log $0 …"
    } >&2
    return 1
  fi
}

# Use the relay that's already up (the Metro bundle has its URL baked in), or
# start one for this run. Class channels are random per class, so a relay left
# over from an earlier run can't leak state into this one — no need for a fresh one.
c_require_relay() {
  if lsof -nP -iTCP:"$RELAY_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "mini-relay already listening on :$RELAY_PORT (kept)"
  else
    h_start_relay
  fi
}

# --- devices -----------------------------------------------------------------
# (Re)open the app on Metro. Terminating first drops any class left running.
c_open_ios() {
  xcrun simctl terminate "$IOS_UDID" "$APP_ID" >/dev/null 2>&1 || true
  xcrun simctl openurl "$IOS_UDID" "$DEV_CLIENT_URL"
}
c_open_droid() {
  adb -s "$ANDROID_SERIAL" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
  adb -s "$ANDROID_SERIAL" reverse tcp:8081 tcp:8081 >/dev/null
  # The live-timer notification asks for POST_NOTIFICATIONS the moment the
  # class starts; a system dialog over the app pauses its JS timers (the
  # finding this suite was written alongside), so grant it up front.
  adb -s "$ANDROID_SERIAL" shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
  adb -s "$ANDROID_SERIAL" shell am start -a android.intent.action.VIEW -d "'$DEV_CLIENT_URL'" >/dev/null
}
# Open a class link on the iOS simulator. When the instructor is the Android
# emulator, the link's `w` is on the emulator's clock; move it onto the Mac's
# (the simulator's) by MEMBER_SKEW_MS.
c_join_ios() {
  local url="$1" w
  w=$(printf '%s' "$url" | sed -n 's/.*[?&]w=\([0-9]*\).*/\1/p')
  if [ -n "$w" ] && [ "${MEMBER_SKEW_MS:-0}" != 0 ]; then
    url=$(printf '%s' "$url" | sed "s/\([?&]\)w=$w/\1w=$((w + MEMBER_SKEW_MS))/")
  fi
  xcrun simctl openurl "$IOS_UDID" "$url"
}
# How many actions the app's class-timer notification offers right now.
c_droid_notif_actions() {
  adb -s "$ANDROID_SERIAL" shell dumpsys notification --noredact \
    | grep "pkg=$APP_ID" | grep -o 'actions=[0-9]*' | head -1 | cut -d= -f2 | grep . || echo 0
}
c_expect_droid_actions() {
  # The service rebuilds the notification a moment after the class changes.
  local want="$1" got i=0
  got=$(c_droid_notif_actions)
  while [ "$got" != "$want" ] && [ $i -lt 10 ]; do
    sleep 0.5
    i=$((i + 1))
    got=$(c_droid_notif_actions)
  done
  if [ "$got" != "$want" ]; then
    echo "FAIL the instructor's notification offers $got action(s), expected $want" >&2
    return 1
  fi
  echo "ok   instructor notification offers $want action(s)"
}

# How far the emulator's time of day is behind the Mac's (ms, Mac − emulator),
# best of 5 adb round trips. The emulator does NOT share the Mac's clock (it
# was 2.2 s behind on 2026-10-25), and a development build lines a linked
# phone up by time of day, so this has to be measured and corrected for.
c_droid_skew() {
  ANDROID_SERIAL="$ANDROID_SERIAL" node -e '
    const { execFileSync } = require("node:child_process");
    let best = null;
    for (let i = 0; i < 7; i++) {
      const t0 = Date.now();
      const a = execFileSync("adb", ["-s", process.env.ANDROID_SERIAL, "shell", "echo $EPOCHREALTIME"]).toString().trim();
      const t1 = Date.now();
      if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, skew: Math.round((t0 + t1) / 2 - Number(a) * 1000) };
    }
    process.stdout.write(String(best.skew));
  '
}
# Open a class link on the member. Development builds join straight from a
# link, lining the clock up by time of day (the camera scan can't run here);
# the link's `w` (the instructor's time of day) is moved onto the emulator's
# clock by MEMBER_SKEW_MS so the member lines up with the Mac in real time.
c_join_droid() {
  local url="$1" w
  w=$(printf '%s' "$url" | sed -n 's/.*[?&]w=\([0-9]*\).*/\1/p')
  if [ -n "$w" ] && [ "${MEMBER_SKEW_MS:-0}" != 0 ]; then
    url=$(printf '%s' "$url" | sed "s/\([?&]\)w=$w/\1w=$((w - MEMBER_SKEW_MS))/")
  fi
  adb -s "$ANDROID_SERIAL" shell am start -a android.intent.action.VIEW -d "'$url'" >/dev/null
}

# The member's app out of the foreground, and back. HOME leaves it running in
# the background; the screen state uses KEYCODE_SLEEP / KEYCODE_WAKEUP, which
# (unlike POWER) only ever go one way.
c_droid_background() { adb -s "$ANDROID_SERIAL" shell input keyevent 3; sleep 2; }
c_droid_foreground() {
  adb -s "$ANDROID_SERIAL" shell am start -n "$APP_ID/.MainActivity" >/dev/null 2>&1 || true
  sleep 2
}
c_droid_screen() {
  if [ "$1" = off ]; then
    adb -s "$ANDROID_SERIAL" shell input keyevent 223
  else
    adb -s "$ANDROID_SERIAL" shell input keyevent 224
  fi
  sleep 2
  adb -s "$ANDROID_SERIAL" shell dumpsys power | grep -m1 'mWakefulness=' | tr -d ' \r'
}

# The instructor's skip, confirmed: Maestro sometimes reports an iOS tap as
# done that the app never received (seen 4 times in ~45 host taps on
# 2026-10-25). A received skip shows as the host's own jump ~1.2 s later; if
# none shows within 4 s the tap was lost, and one more is safe.
c_host_skip() {
  local since="$1"
  h_ios 07-host-skip.yaml
  if ! c_log wait --since "$since" --dev "ios host" --what jump --timeout 4000 >/dev/null 2>&1; then
    echo "host skip tap not received by the app; tapping once more"
    h_ios 07-host-skip.yaml
  fi
}

# --- oracles -----------------------------------------------------------------
# Both phones did <what> (run|pause|jump|at), on the same step, within TOL_MS.
c_pair() {
  local since="$1" what="$2"; shift 2
  c_log pair --since "$since" --what "$what" --tol "$TOL_MS" "$@"
}
# The member caught up with the host's current step (after a step-out or a
# partition): the member's arrival step equals the host's step at that moment.
c_member_matches_host() {
  local since="$1" timeout="${2:-15000}"
  local got wall step hstep
  got=$(c_log wait --since "$since" --dev "android member" --what jump --timeout "$timeout") || {
    echo "FAIL member never jumped back to the class" >&2
    return 1
  }
  wall=${got% *}
  step=${got#* }
  hstep=$(c_log step --dev "ios host" --at "$((wall + TOL_MS))")
  if [ "$step" != "$hstep" ]; then
    echo "FAIL member landed on step $step @$wall but the class (host) is on step $hstep" >&2
    return 1
  fi
  echo "ok   member back on the class's step $step @$wall"
}

# --- member-only network chaos (toxiproxy) -----------------------------------
# The member's ONLY relay is toxiproxy on CHAOS_PORT (upstream: the mini-relay),
# while the instructor goes straight to the relay. That needs Metro started with
#   EXPO_PUBLIC_SYNC_RELAYS="ws://127.0.0.1:$RELAY_PORT,ws://10.0.2.2:$CHAOS_PORT"
# (iOS reaches 127.0.0.1 = the Mac; the emulator reaches the Mac as 10.0.2.2 and
# its own 127.0.0.1 is itself, so it only ever uses the proxied URL — do NOT
# `adb reverse tcp:$RELAY_PORT`). Faults then hit the member's link alone.
TOXI_API="${TOXI_API:-http://127.0.0.1:8474}"
TOXI_PROXY="class-member"
_TOXI_PID=""
c_tp() {
  if [ $# -ge 3 ]; then
    curl -sf -X "$1" "$TOXI_API$2" -H 'Content-Type: application/json' -d "$3"
  else
    curl -sf -X "$1" "$TOXI_API$2"
  fi
}
c_chaos_up() {
  command -v toxiproxy-server >/dev/null 2>&1 || {
    echo "toxiproxy-server not on PATH — brew install toxiproxy" >&2
    return 3
  }
  if ! c_tp GET /version >/dev/null 2>&1; then
    toxiproxy-server >/dev/null 2>&1 &
    _TOXI_PID=$!
    local i=0
    until c_tp GET /version >/dev/null 2>&1; do
      i=$((i + 1)); [ $i -gt 40 ] && { echo "toxiproxy API never came up" >&2; return 3; }
      sleep 0.25
    done
  fi
  c_tp DELETE "/proxies/$TOXI_PROXY" >/dev/null 2>&1 || true
  c_tp POST /proxies "{\"name\":\"$TOXI_PROXY\",\"listen\":\"0.0.0.0:$CHAOS_PORT\",\"upstream\":\"127.0.0.1:$RELAY_PORT\",\"enabled\":true}" >/dev/null
  # The member must not have a direct path to the relay.
  adb -s "$ANDROID_SERIAL" reverse --remove "tcp:$RELAY_PORT" >/dev/null 2>&1 || true
  echo "toxiproxy: member link 0.0.0.0:$CHAOS_PORT → 127.0.0.1:$RELAY_PORT"
}
c_chaos_down() {
  c_tp DELETE "/proxies/$TOXI_PROXY" >/dev/null 2>&1 || true
  [ -n "$_TOXI_PID" ] && kill "$_TOXI_PID" 2>/dev/null || true
  _TOXI_PID=""
}
# Member link fully down (existing sockets reset, new ones refused) / back up.
c_link() { c_tp POST "/proxies/$TOXI_PROXY" "{\"enabled\":$([ "$1" = up ] && echo true || echo false)}" >/dev/null; echo "member link $1"; }
# c_toxic_add <name> <type> <stream> '<attributes json>' [toxicity]
c_toxic_add() {
  c_tp POST "/proxies/$TOXI_PROXY/toxics" \
    "{\"name\":\"$1\",\"type\":\"$2\",\"stream\":\"$3\",\"toxicity\":${5:-1.0},\"attributes\":$4}" >/dev/null
  echo "member link +$1 ($2 $4)"
}
c_toxic_rm() { c_tp DELETE "/proxies/$TOXI_PROXY/toxics/$1" >/dev/null 2>&1 || true; echo "member link -$1"; }
c_toxics_clear() {
  local n
  for n in $(c_tp GET "/proxies/$TOXI_PROXY/toxics" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const t of JSON.parse(s))console.log(t.name)}catch{}})'); do
    c_toxic_rm "$n" >/dev/null
  done
  c_link up >/dev/null
}
