/**
 * The class code: what the instructor's screen shows and everyone else scans.
 * It is the whole invitation — the workout, when it starts, the class key
 * (which names the relay channel and seals every message on it), and the
 * instructor's public signing key (so phones only obey the instructor) — plus
 * the class time it was drawn at, which is what lines a scanning phone's clock
 * up (class/clockSync). The workout itself only ever travels inside this
 * code, never over the relay.
 *
 *   fwt://class?v=1&d=<base64url JSON>&c=<class time drawn>&w=<wall time drawn>
 *
 * `d` never changes for a class, so redrawing the code each tenth of a second
 * only rewrites `c` and `w`. `w` (the instructor's time of day at the same
 * moment) is the fallback for a code opened as a link rather than scanned
 * live: it lines up only as well as the two phones' time-of-day clocks agree.
 */

import naclUtil from 'tweetnacl-util';
import type { TimerConfig, TimerKind, SequenceInterval } from '../types';

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil;

export const CLASS_CODE_VERSION = 1;
const KINDS: TimerKind[] = ['intervals', 'sequence', 'amrap', 'for_time'];

export interface ClassInvite {
  workout: TimerConfig;
  /** Class time the workout's first second starts. */
  startAt: number;
  /** The class secret, base64 (32 bytes). */
  key: string;
  /** The instructor's signing public key, base64. */
  host: string;
}

/** Compact wire form: short keys, numbers in a fixed order. */
interface Wire {
  n: string;
  k: number;
  t: number[]; // initialCountdown warmUp exercise rest sets recovery cycles coolDown repeats timeCap
  i?: [string, number, 0 | 1][]; // name, seconds, 1 = rest
  s: number;
  x: string;
  h: string;
}

function toB64Url(bytes: Uint8Array): string {
  return encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeBase64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
}

/** The fixed part of a class's code (`d`). */
export function encodeInvite(inv: ClassInvite): string {
  const w = inv.workout;
  const wire: Wire = {
    n: w.name,
    k: Math.max(0, KINDS.indexOf(w.kind ?? 'intervals')),
    t: [
      w.initialCountdown,
      w.warmUp,
      w.exercise,
      w.rest,
      w.sets,
      w.recovery,
      w.cycles,
      w.coolDown,
      w.repeats ?? 1,
      w.timeCap ?? 0,
    ],
    s: Math.round(inv.startAt),
    x: inv.key,
    h: inv.host,
  };
  if (w.intervals?.length) {
    wire.i = w.intervals.map((iv) => [iv.name, iv.duration, iv.kind === 'rest' ? 1 : 0]);
  }
  return toB64Url(decodeUTF8(JSON.stringify(wire)));
}

/** The full code to draw, with the class time (and time of day) it is drawn at. */
export function classCodeUrl(invite: string, classNow: number, wallNow: number): string {
  return `fwt://class?v=${CLASS_CODE_VERSION}&d=${invite}&c=${Math.round(classNow)}&w=${Math.round(wallNow)}`;
}

/**
 * Class time minus time of day on the instructor's phone, from a code's `c`
 * and `w` — a link-opened code's only way to line a clock up. Null if absent.
 */
export function wallOffsetOf(classNow: number | null, wallNow: number | null): number | null {
  return classNow != null && wallNow != null ? classNow - wallNow : null;
}

// React Native's URLSearchParams is not dependable across versions; the code's
// query is ours and plain (base64url and digits), so read it directly.
function queryParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of url.slice(url.indexOf('?') + 1).split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return out;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sec = (v: unknown, max = 24 * 3600): number => (isNum(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);

/**
 * Read a scanned code (or a tapped fwt://class link). Null for anything that
 * isn't a class code this version understands. `classNow` / `wallNow` are null
 * when the code carried no draw time.
 */
export function parseClassCode(
  text: string,
): { invite: ClassInvite; inviteCode: string; classNow: number | null; wallNow: number | null } | null {
  try {
    if (!/^fwt:\/\/class\?/.test(text)) return null;
    const q = queryParams(text);
    if (q.v !== String(CLASS_CODE_VERSION)) return null;
    const d = q.d;
    if (!d) return null;
    const wire = JSON.parse(encodeUTF8(fromB64Url(d))) as Wire;
    if (!wire || typeof wire.n !== 'string' || !Array.isArray(wire.t) || wire.t.length < 10) return null;
    if (!isNum(wire.s) || typeof wire.x !== 'string' || typeof wire.h !== 'string') return null;
    const [cd, warm, ex, rest, sets, rec, cycles, cool, repeats, cap] = wire.t;
    const intervals: SequenceInterval[] | undefined = Array.isArray(wire.i)
      ? wire.i.slice(0, 200).map(([name, duration, rest1], idx) => ({
          id: `class-iv-${idx}`,
          name: String(name ?? '').slice(0, 60),
          duration: sec(duration),
          kind: rest1 === 1 ? 'rest' : 'work',
        }))
      : undefined;
    const workout: TimerConfig = {
      id: `class-${wire.s}`,
      name: wire.n.slice(0, 80),
      kind: KINDS[wire.k] ?? 'intervals',
      initialCountdown: sec(cd),
      warmUp: sec(warm),
      exercise: sec(ex),
      rest: sec(rest),
      sets: Math.max(1, Math.min(99, sec(sets))),
      recovery: sec(rec),
      cycles: Math.max(1, Math.min(99, sec(cycles))),
      coolDown: sec(cool),
      repeats: Math.max(1, Math.min(99, sec(repeats))),
      timeCap: sec(cap),
      ...(intervals ? { intervals } : {}),
      createdAt: 0,
      updatedAt: 0,
    };
    const c = q.c == null ? NaN : Number(q.c);
    const w = q.w == null ? NaN : Number(q.w);
    return {
      invite: { workout, startAt: wire.s, key: wire.x, host: wire.h },
      inviteCode: d,
      classNow: Number.isFinite(c) ? c : null,
      wallNow: Number.isFinite(w) ? w : null,
    };
  } catch {
    return null;
  }
}
