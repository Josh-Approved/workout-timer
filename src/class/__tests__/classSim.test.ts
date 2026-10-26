/**
 * Class simulation — a room of phones, the pure-logic version of the chaos
 * test. One instructor issues random pauses, skips and backs; every member's
 * phone has its own clock-line-up error, and every relay delivery has its own
 * delay or is dropped outright (recovered only when the phone reconnects and
 * the relay replays the latest timeline). After every quarter second, asserts
 * INTENT:
 *
 *   I-AGREE     a phone holding the instructor's latest timeline is exactly
 *               where the instructor is, give or take its own line-up error
 *               (never more), outside the instant a jump lands.
 *   I-CONVERGE  once the last delivery lands, every phone is in step.
 *   I-ON-TIME   a command delivered inside its lead takes effect on that phone
 *               at the same moment as on the instructor's (no snap-back).
 *
 * Runs in `npm test`, so a change that breaks class sync fails before a build.
 */

import fc from 'fast-check';
import type { PhaseStep } from '../../types';
import {
  newTimeline,
  classClockAt,
  toggleClassPause,
  classSkip,
  classBack,
  type ClassTimeline,
} from '../timeline';

const STEPS: PhaseStep[] = [
  { phase: 'initial_countdown', duration: 5 },
  ...Array.from({ length: 8 }, (_, i): PhaseStep[] => [
    { phase: 'exercise', duration: 20, setNumber: i + 1 },
    { phase: 'rest', duration: 10, setNumber: i + 1 },
  ]).flat(),
  { phase: 'cool_down', duration: 30 },
];
const START = 1_000_000;
const RECONNECT_MS = 10_000;

interface PhoneDraw {
  lineUpErr: number;
  delays: (number | null)[]; // per command: relay delay, or null = dropped
}

const commandArb = fc.record({
  t: fc.integer({ min: -1_000, max: 240_000 }),
  kind: fc.constantFrom('pause', 'pause', 'skip', 'back'),
});

const phoneArb = (n: number): fc.Arbitrary<PhoneDraw> =>
  fc.record({
    lineUpErr: fc.integer({ min: -100, max: 100 }),
    delays: fc.array(fc.oneof(fc.integer({ min: 30, max: 3_000 }), fc.constant(null)), {
      minLength: n,
      maxLength: n,
    }),
  });

const scenarioArb = fc
  .array(commandArb, { minLength: 0, maxLength: 12 })
  .chain((cmds) =>
    fc.tuple(fc.constant(cmds), fc.array(phoneArb(cmds.length), { minLength: 2, maxLength: 8 })),
  );

describe('a class of phones stays in step', () => {
  it('through random commands, line-up errors, late and dropped messages', () => {
    fc.assert(
      fc.property(scenarioArb, ([rawCmds, phones]) => {
        // The instructor's history: each command makes a new timeline.
        const versions: { at: number; tl: ClassTimeline }[] = [{ at: -Infinity, tl: newTimeline(START) }];
        let tl = versions[0].tl;
        for (const c of [...rawCmds].sort((a, b) => a.t - b.t)) {
          const now = START + c.t;
          const next =
            c.kind === 'pause'
              ? toggleClassPause(STEPS, tl, now)
              : c.kind === 'skip'
                ? classSkip(STEPS, tl, now)
                : classBack(STEPS, tl, now, 1);
          if (next !== tl) versions.push({ at: now, tl: next });
          tl = next;
        }
        const hostAt = (x: number) => [...versions].reverse().find((v) => v.at <= x)!.tl;
        const landings = tl.commands.map((c) => c.at);
        const lastIssue = versions[versions.length - 1].at;

        for (const p of phones) {
          // When each version reaches this phone: its delay, or (dropped) the
          // next reconnect, which replays whatever is latest by then.
          const arrivals = versions.slice(1).map((v, i) => {
            const d = p.delays[i];
            return d == null ? Math.ceil((v.at + 1) / RECONNECT_MS) * RECONNECT_MS : v.at + d;
          });
          const phoneAt = (x: number): ClassTimeline => {
            let have = versions[0].tl;
            versions.slice(1).forEach((v, i) => {
              if (arrivals[i] <= x && v.tl.seq > have.seq) have = v.tl;
            });
            // A reconnect replays the latest deposit.
            const lastReconnect = Math.floor(x / RECONNECT_MS) * RECONNECT_MS;
            const replay = hostAt(lastReconnect);
            return replay.seq > have.seq && p.delays.some((d) => d == null) ? replay : have;
          };
          const err = Math.abs(p.lineUpErr);
          const settled = Math.max(lastIssue, ...arrivals.filter(Number.isFinite), START) + 1;
          for (let x = START - 2_000; x < START + 320_000; x += 250) {
            const host = classClockAt(STEPS, hostAt(x), x);
            const mine = phoneAt(x);
            const me = classClockAt(STEPS, mine, x + p.lineUpErr);
            const nearLanding = landings.some((a) => Math.abs(a - x) <= err + 1) || Math.abs(x - START) <= err + 1;
            if (nearLanding) continue;
            const diff = Math.abs(me.elapsedMs - host.elapsedMs);
            if (mine.seq === hostAt(x).seq) {
              // I-AGREE
              if (diff > err) throw new Error(`phone off by ${diff}ms (line-up ${p.lineUpErr}) at +${x - START}ms`);
            }
            if (x >= settled && diff > err) {
              // I-CONVERGE
              throw new Error(`phone never caught up: ${diff}ms at +${x - START}ms`);
            }
          }
          // I-ON-TIME — a version that arrived before its first landing (minus
          // the line-up error) acted at the same instant as the instructor.
          versions.slice(1).forEach((v, i) => {
            const firstNew = v.tl.commands[v.tl.commands.length - 1]?.at;
            if (firstNew == null || arrivals[i] > firstNew - err - 1) return;
            const probe = firstNew + err + 2;
            if (hostAt(probe).seq !== v.tl.seq || phoneAt(probe).seq !== v.tl.seq) return;
            const d = Math.abs(
              classClockAt(STEPS, v.tl, probe + p.lineUpErr).elapsedMs - classClockAt(STEPS, v.tl, probe).elapsedMs,
            );
            if (d > err) throw new Error(`command arrived in time but acted ${d}ms off`);
          });
        }
      }),
      { numRuns: 150 },
    );
  });
});
