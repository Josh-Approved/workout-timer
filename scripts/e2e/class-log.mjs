#!/usr/bin/env node
/**
 * Class mode (beta) two-device E2E: the timing oracle.
 *
 * Development builds log every class step change to Metro as
 *   [class] <ios|android> <host|member> <step|jump|run|pause> step=<n> running=<bool> wall=<epoch ms>
 * and the class link as
 *   [class] code fwt://class?...
 * This reads Metro's log (the file Metro's output is tee'd into, METRO_LOG)
 * from a byte offset taken at the start of a phase, and answers the questions
 * the runners ask: what is the class link, did both phones act, how far apart
 * (wall-clock ms), on the same step, and did a partitioned phone stay put.
 *
 * iOS simulators share the Mac's clock. The Android emulator keeps its OWN
 * time of day (2.2 s behind the Mac when this was written), so the member's
 * stamps are shifted by MEMBER_SKEW_MS (Mac − emulator, measured by the runner)
 * and the class link the member opens is corrected by the same amount — without
 * that, the member runs seconds late in real time while its own stamps look
 * perfectly in step.
 *
 * Usage (all commands take --log <file>; most take --since <byte offset>;
 * --member-skew <ms> or MEMBER_SKEW_MS shifts the member's stamps):
 *   offset                                   print the log's current size
 *   url    [--timeout ms] [--expect-name n]  first class link after --since (and
 *                                            check the workout name it carries)
 *   wait   --dev "<os> <role>" --what <w> [--step n] [--timeout ms]
 *                                            first matching event; prints "wall step"
 *   pair   --what <w> [--step n] [--tol ms] [--timeout ms]
 *                                            first matching event on the host AND
 *                                            the member; fails if steps differ or
 *                                            the spread exceeds --tol
 *   none   --dev "<os> <role>" --what <w> --for ms
 *                                            fails if such an event shows up within --for
 *   step   --dev "<os> <role>" [--at wall]   the device's latest step (from step/jump
 *                                            events), optionally as of a wall time
 *   converged [--timeout ms]                 host and member agree on step and
 *                                            running/paused (latest events)
 *   heartbeat --url <class link> [--relay ws://…] [--for ms] [--max-gap ms]
 *                                            the instructor keeps depositing on the
 *                                            class channel (no gap over --max-gap)
 *   table                                    every class event after --since, grouped
 *
 * <w> is step | jump | run | pause | at (at = step or jump: "arrived at step n").
 * Exit 0 = oracle held, 1 = oracle failed, 2 = timed out waiting.
 */

import fs from 'node:fs';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt;
};
const LOG = opt('log', process.env.METRO_LOG);
const SINCE = Number(opt('since', 0));
const HOST = opt('host', 'ios host');
const MEMBER = opt('member', 'android member');
const RE = /\[class\] (ios|android) (host|member) (step|jump|run|pause) step=(\d+) running=(\w+) wall=(\d+)/;
// The Android emulator's time of day is NOT the Mac's (measured 2.2 s behind on
// 2026-10-25). Its stamps — whichever role it plays — are moved onto the Mac's
// clock by this many ms (Mac − emulator), which the runner measures over adb
// (class-lib c_droid_skew).
const ANDROID_SKEW = Number(opt('member-skew', process.env.MEMBER_SKEW_MS || 0));

if (!LOG || !fs.existsSync(LOG)) {
  console.error(`class-log: no Metro log at "${LOG}" (set METRO_LOG or --log)`);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readSince() {
  const fd = fs.openSync(LOG, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const len = Math.max(0, size - SINCE);
    const buf = Buffer.alloc(len);
    if (len) fs.readSync(fd, buf, 0, len, SINCE);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function events() {
  const out = [];
  for (const line of readSince().split('\n')) {
    const m = line.match(RE);
    if (!m) continue;
    const dev = `${m[1]} ${m[2]}`;
    const wall = Number(m[6]) + (m[1] === 'android' ? ANDROID_SKEW : 0);
    out.push({ dev, what: m[3], step: Number(m[4]), running: m[5] === 'true', wall });
  }
  return out;
}

const matchWhat = (e, w) => (w === 'at' ? e.what === 'step' || e.what === 'jump' : e.what === w);

function find(dev, what, step) {
  return events().find(
    (e) => e.dev === dev && matchWhat(e, what) && (step == null || e.step === Number(step)),
  );
}

async function until(fn, timeoutMs) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(150);
  }
}

async function main() {
  switch (cmd) {
    case 'offset': {
      console.log(fs.statSync(LOG).size);
      return 0;
    }
    case 'url': {
      const url = await until(() => {
        const m = readSince().match(/\[class\] code (fwt:\/\/class\?\S+)/);
        return m ? m[1].replace(/['",]+$/, '') : null;
      }, Number(opt('timeout', 20000)));
      if (!url) {
        console.error('class-log: no class link logged (is this a development build on Metro?)');
        return 2;
      }
      const expect = opt('expect-name');
      if (expect) {
        const d = (url.match(/[?&]d=([^&]+)/) || [])[1] || '';
        let name = null;
        try {
          name = JSON.parse(Buffer.from(d.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).n;
        } catch {}
        if (name !== expect) {
          console.error(`FAIL the class runs "${name}", not the picked timer "${expect}"`);
          return 1;
        }
      }
      console.log(url);
      return 0;
    }
    case 'wait': {
      const dev = opt('dev', HOST);
      const e = await until(() => find(dev, opt('what'), opt('step')), Number(opt('timeout', 15000)));
      if (!e) {
        console.error(`class-log: ${dev} never logged ${opt('what')}${opt('step') != null ? ` step=${opt('step')}` : ''}`);
        return 2;
      }
      console.log(`${e.wall} ${e.step}`);
      return 0;
    }
    case 'pair': {
      const what = opt('what');
      const step = opt('step');
      const tol = Number(opt('tol', 250));
      const got = await until(() => {
        const h = find(HOST, what, step);
        const m = find(MEMBER, what, step);
        return h && m ? { h, m } : null;
      }, Number(opt('timeout', 15000)));
      if (!got) {
        const h = find(HOST, what, step);
        const m = find(MEMBER, what, step);
        console.error(
          `class-log: pair ${what}${step != null ? ` step=${step}` : ''} incomplete — ` +
            `host=${h ? `${h.wall} step=${h.step}` : 'none'} member=${m ? `${m.wall} step=${m.step}` : 'none'}`,
        );
        return 2;
      }
      const spread = Math.abs(got.h.wall - got.m.wall);
      const sameStep = got.h.step === got.m.step;
      const line =
        `${what}: host step=${got.h.step} @${got.h.wall}  member step=${got.m.step} @${got.m.wall}  ` +
        `spread=${spread}ms (tol ${tol})`;
      if (!sameStep || spread > tol) {
        console.error(`FAIL ${line}${sameStep ? '' : '  STEPS DIFFER'}`);
        return 1;
      }
      console.log(`ok   ${line}`);
      return 0;
    }
    case 'none': {
      const dev = opt('dev', MEMBER);
      const e = await until(() => find(dev, opt('what'), opt('step')), Number(opt('for', 4000)));
      if (e) {
        console.error(`FAIL ${dev} logged ${e.what} step=${e.step} @${e.wall} while it should not have`);
        return 1;
      }
      console.log(`ok   ${dev} stayed put (no ${opt('what')} for ${opt('for', 4000)}ms)`);
      return 0;
    }
    case 'step': {
      const dev = opt('dev', HOST);
      const at = Number(opt('at', Infinity));
      const all = events().filter((e) => e.dev === dev && (e.what === 'step' || e.what === 'jump') && e.wall <= at);
      if (!all.length) return 2;
      console.log(all[all.length - 1].step);
      return 0;
    }
    case 'converged': {
      // Host and member agree on the step they're on and on running/paused,
      // judged from each one's latest events (after --since, which must cover
      // each phone's last run/pause).
      const latest = (dev, kinds) => {
        const all = events().filter((e) => e.dev === dev && kinds.includes(e.what));
        return all[all.length - 1] ?? null;
      };
      let last = '';
      const ok = await until(() => {
        // Every event carries the step the phone is on (a pause that reached a
        // phone late moves it back with no step/jump event of its own).
        const hs = latest(HOST, ['step', 'jump', 'run', 'pause']);
        const ms = latest(MEMBER, ['step', 'jump', 'run', 'pause']);
        const hr = latest(HOST, ['run', 'pause']);
        const mr = latest(MEMBER, ['run', 'pause']);
        last = `host step=${hs?.step} ${hr?.what ?? '?'} / member step=${ms?.step} ${mr?.what ?? '?'}`;
        return hs && ms && hr && mr && hs.step === ms.step && hr.what === mr.what;
      }, Number(opt('timeout', 15000)));
      if (!ok) {
        console.error(`FAIL not converged: ${last}`);
        return 1;
      }
      console.log(`ok   converged: ${last}`);
      return 0;
    }
    case 'heartbeat': {
      // Listen on the class's relay channel (from the class link's key) and
      // check the instructor keeps depositing: every gap between deposits
      // must stay under --max-gap for --for ms.
      const { createRequire } = await import('node:module');
      const req = createRequire(new URL('../../package.json', import.meta.url));
      const nacl = req('tweetnacl');
      const WS = req('ws');
      const url = opt('url');
      const d = (url.match(/[?&]d=([^&]+)/) || [])[1] || '';
      const b64 = d.replace(/-/g, '+').replace(/_/g, '/');
      const wire = JSON.parse(Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8'));
      const channel = Buffer.from(nacl.hash(new Uint8Array(Buffer.from(wire.x, 'base64'))).slice(32, 48)).toString('base64');
      const forMs = Number(opt('for', 60000));
      const maxGap = Number(opt('max-gap', 15000));
      const arrivals = [];
      const t0 = Date.now();
      await new Promise((resolve) => {
        const ws = new WS(opt('relay', 'ws://127.0.0.1:7447'));
        ws.on('open', () =>
          ws.send(JSON.stringify(['REQ', 'hb', { kinds: [30078], '#t': [channel], since: Math.floor(t0 / 1000) - 1 }])),
        );
        ws.on('message', (m) => {
          const msg = JSON.parse(String(m));
          if (msg[0] === 'EVENT' && Date.now() - t0 > 200) arrivals.push(Date.now());
        });
        ws.on('error', resolve);
        setTimeout(() => {
          ws.close();
          resolve();
        }, forMs);
      });
      const points = [t0, ...arrivals, t0 + forMs];
      let worst = 0;
      for (let i = 1; i < points.length; i++) worst = Math.max(worst, points[i] - points[i - 1]);
      const line = `instructor deposits over ${forMs / 1000}s: ${arrivals.length}, longest gap ${worst}ms (max ${maxGap})`;
      if (worst > maxGap) {
        console.error(`FAIL ${line}`);
        return 1;
      }
      console.log(`ok   ${line}`);
      return 0;
    }
    case 'table': {
      const evs = events();
      const groups = [];
      for (const e of evs) {
        const kind = e.what === 'step' || e.what === 'jump' ? 'at' : e.what;
        let g = groups.find((x) => x.kind === kind && x.step === e.step && Math.abs(x.first - e.wall) < 3000 && !x.devs.has(e.dev));
        if (!g) groups.push((g = { kind, step: e.step, first: e.wall, devs: new Map() }));
        g.devs.set(e.dev, e);
      }
      const devs = [...new Set(evs.map((e) => e.dev))].sort();
      console.log(['event', 'step', ...devs, 'spread_ms'].join('\t'));
      for (const g of groups) {
        const ws = [...g.devs.values()].map((e) => e.wall);
        const min = Math.min(...ws);
        const cells = devs.map((d) => (g.devs.has(d) ? `${g.devs.get(d).what}@${g.devs.get(d).wall}` : '-'));
        console.log([g.kind, g.step, ...cells, Math.max(...ws) - min].join('\t'));
      }
      return 0;
    }
    default:
      console.error('usage: class-log.mjs offset|url|wait|pair|none|step|table --log <metro log> [--since n] ...');
      return 2;
  }
}

main().then((code) => process.exit(code));
