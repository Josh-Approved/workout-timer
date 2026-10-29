/**
 * Class mode's live link: the instructor's timeline, carried between phones by
 * the studio's end-to-end-encrypted relay courier (src/sync — the shared-sync
 * module's transport + crypto, the same one Grocery List syncs through). Free
 * public relays we don't run see only ciphertext under a random channel tag.
 *
 * The instructor deposits the whole (tiny) timeline on every command as a
 * stored slot, so it fans out live AND replays to any phone that connects
 * later: a late joiner, or a phone back from a dead zone, has the current
 * state the moment it reconnects. The timeline is signed with the
 * instructor's key from the class code, so a phone obeys only the instructor,
 * never another member who also holds the class key. Only commands travel
 * here — never the workout, never anything about the person.
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { DropBoxTransport } from '../sync/transport';
import { channelId, seal, open, authorSeed } from '../sync/crypto';
import type { ClassCommand, ClassTimeline } from './timeline';

const { encodeBase64, decodeBase64, decodeUTF8 } = naclUtil;

/** A new class's secrets: the class key (channel + sealing) and the instructor's signing pair. */
export function newClassKeys(): { key: string; hostPub: string; hostSecret: string } {
  const pair = nacl.sign.keyPair();
  return {
    key: encodeBase64(nacl.randomBytes(32)),
    hostPub: encodeBase64(pair.publicKey),
    hostSecret: encodeBase64(pair.secretKey),
  };
}

/** Sign and seal a timeline for the relay. */
export function packTimeline(key: string, tl: ClassTimeline, hostSecret: string): string {
  const t = JSON.stringify(tl);
  const sig = encodeBase64(nacl.sign.detached(decodeUTF8(t), decodeBase64(hostSecret)));
  return seal(key, JSON.stringify({ t, sig }));
}

const MAX_COMMANDS = 1000;

function validCommand(c: unknown): c is ClassCommand {
  if (!c || typeof c !== 'object') return false;
  const x = c as { at?: unknown; action?: unknown; step?: unknown };
  if (typeof x.at !== 'number' || !Number.isFinite(x.at)) return false;
  if (x.action === 'pause' || x.action === 'resume') return true;
  return x.action === 'goto' && typeof x.step === 'number' && Number.isFinite(x.step);
}

/** Open, verify (instructor's signature) and check a relay message. Null for anything else. */
export function unpackTimeline(key: string, hostPub: string, ciphertext: string): ClassTimeline | null {
  try {
    const plain = open(key, ciphertext);
    if (!plain) return null;
    const { t, sig } = JSON.parse(plain) as { t?: unknown; sig?: unknown };
    if (typeof t !== 'string' || typeof sig !== 'string') return null;
    if (!nacl.sign.detached.verify(decodeUTF8(t), decodeBase64(sig), decodeBase64(hostPub))) return null;
    const tl = JSON.parse(t) as ClassTimeline;
    if (typeof tl.startAt !== 'number' || typeof tl.seq !== 'number' || !Array.isArray(tl.commands)) return null;
    if (tl.commands.length > MAX_COMMANDS || !tl.commands.every(validCommand)) return null;
    return tl;
  } catch {
    return null;
  }
}

export interface ClassRelayOptions {
  key: string;
  hostPub: string;
  /** The instructor's phone only: signs and deposits the timeline. */
  hostSecret?: string;
  /** A newer timeline from the instructor (members). */
  onTimeline: (tl: ClassTimeline) => void;
  /** Any valid message from the instructor arrived (after onTimeline, if newer). */
  onHeard?: () => void;
  /**
   * Instructor: a relay is reachable. Member: the instructor has actually been
   * heard recently — an open socket that has gone quiet is not "live".
   */
  onLive: (live: boolean) => void;
}

/** The instructor re-deposits the timeline this often: a heartbeat, and a repair for any relay that missed one. */
export const HEARTBEAT_MS = 10_000;
/**
 * How often the owner calls `pulse()`. The driver arms it natively as well as
 * with a JS timer, so the heartbeat and the watchdog keep going while an
 * Android app is in the background (where JS timers stop).
 */
export const PULSE_MS = 5_000;
/** A member that hasn't heard the instructor for this long is not live, and reconnects. */
export const SILENCE_MS = 25_000;

export class ClassRelay {
  private transport: DropBoxTransport;
  private latest: ClassTimeline | null = null;
  private heardSeq = -1;
  private openRelays = 0;
  private lastHeard = 0;
  private lastRestart = 0;
  private lastDeposit = 0;

  constructor(private opts: ClassRelayOptions) {
    this.transport = this.makeTransport();
  }

  private makeTransport(): DropBoxTransport {
    return new DropBoxTransport(
      channelId(this.opts.key),
      (ct, at) => this.onMessage(ct, at),
      () => this.redeposit(),
      (openRelays) => {
        this.openRelays = openRelays;
        this.reportLive();
      },
      undefined,
      // The instructor's slot is stable across relaunches so each deposit
      // replaces the last; members never deposit, so a throwaway key is right.
      this.opts.hostSecret ? authorSeed(this.opts.key, 'host') : undefined,
    );
  }

  start(): void {
    this.lastRestart = Date.now();
    this.transport.start();
  }

  close(): void {
    this.transport.close();
  }

  /**
   * Call every PULSE_MS. Instructor: the heartbeat re-deposit. Member: notice
   * a link gone quiet (open but passing nothing) and reconnect, which also
   * replays the latest deposit.
   */
  pulse(): void {
    if (this.opts.hostSecret) {
      if (Date.now() - this.lastDeposit >= HEARTBEAT_MS) this.redeposit();
      return;
    }
    this.reportLive();
    const quietFor = Date.now() - Math.max(this.lastHeard, this.lastRestart);
    if (quietFor > SILENCE_MS) this.restart();
  }

  private restart(): void {
    this.lastRestart = Date.now();
    this.transport.close();
    this.openRelays = 0;
    this.transport = this.makeTransport();
    this.transport.start();
  }

  private reportLive(): void {
    if (this.opts.hostSecret) this.opts.onLive(this.openRelays > 0);
    else this.opts.onLive(this.openRelays > 0 && Date.now() - this.lastHeard < SILENCE_MS);
  }

  /** Instructor: deposit the timeline (kept, and re-deposited on every reconnect). */
  publish(tl: ClassTimeline): void {
    if (!this.opts.hostSecret) return;
    this.latest = tl;
    this.lastDeposit = Date.now();
    this.transport.publishStored(packTimeline(this.opts.key, tl, this.opts.hostSecret), 'timeline');
  }

  private redeposit(): void {
    if (this.latest) this.publish(this.latest);
  }

  private onMessage(ciphertext: string, at: number): void {
    const tl = unpackTimeline(this.opts.key, this.opts.hostPub, ciphertext);
    if (!tl) return;
    const wasLive = Date.now() - this.lastHeard < SILENCE_MS;
    // Only a recent deposit means the instructor is there now. A reconnect
    // replays the last one however old it is: its timeline still counts, but
    // it isn't the instructor speaking. (`at` is the instructor's clock; the
    // silence window is wide enough to absorb two phones' clocks disagreeing.)
    if (Date.now() - at < SILENCE_MS) this.lastHeard = Date.now();
    if (tl.seq > this.heardSeq) {
      this.heardSeq = tl.seq;
      this.opts.onTimeline(tl);
    }
    this.opts.onHeard?.();
    if (!wasLive) this.reportLive();
  }
}
