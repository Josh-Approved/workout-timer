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
  /** Whether any relay is reachable right now. */
  onLive: (live: boolean) => void;
}

export class ClassRelay {
  private transport: DropBoxTransport;
  private latest: ClassTimeline | null = null;
  private heardSeq = -1;

  constructor(private opts: ClassRelayOptions) {
    this.transport = new DropBoxTransport(
      channelId(opts.key),
      (ct) => this.onMessage(ct),
      () => this.redeposit(),
      (openRelays) => opts.onLive(openRelays > 0),
      undefined,
      // The instructor's slot is stable across relaunches so each deposit
      // replaces the last; members never deposit, so a throwaway key is right.
      opts.hostSecret ? authorSeed(opts.key, 'host') : undefined,
    );
  }

  start(): void {
    this.transport.start();
  }

  close(): void {
    this.transport.close();
  }

  /** Instructor: deposit the timeline (kept, and re-deposited on every reconnect). */
  publish(tl: ClassTimeline): void {
    if (!this.opts.hostSecret) return;
    this.latest = tl;
    this.transport.publishStored(packTimeline(this.opts.key, tl, this.opts.hostSecret), 'timeline');
  }

  private redeposit(): void {
    if (this.latest) this.publish(this.latest);
  }

  private onMessage(ciphertext: string): void {
    const tl = unpackTimeline(this.opts.key, this.opts.hostPub, ciphertext);
    if (!tl || tl.seq <= this.heardSeq) return;
    this.heardSeq = tl.seq;
    this.opts.onTimeline(tl);
  }
}
