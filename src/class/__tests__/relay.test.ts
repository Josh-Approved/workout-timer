/**
 * The class relay's message layer (class/relay.ts): what goes on the wire is
 * sealed with the class key and signed by the instructor, and a phone accepts
 * only that — never a forged or altered timeline from someone else who also
 * scanned the code.
 */

import { newClassKeys, packTimeline, unpackTimeline } from '../relay';
import { newTimeline, toggleClassPause } from '../timeline';

const tl = toggleClassPause([{ phase: 'exercise', duration: 30 }], newTimeline(1_000), 2_000);

describe('class relay messages', () => {
  it('round-trips a timeline the instructor signed', () => {
    const k = newClassKeys();
    expect(unpackTimeline(k.key, k.hostPub, packTimeline(k.key, tl, k.hostSecret))).toEqual(tl);
  });

  it('refuses a timeline signed by anyone but the instructor', () => {
    const k = newClassKeys();
    const impostor = newClassKeys();
    expect(unpackTimeline(k.key, k.hostPub, packTimeline(k.key, tl, impostor.hostSecret))).toBeNull();
  });

  it('refuses a message sealed for another class, or garbage', () => {
    const k = newClassKeys();
    const other = newClassKeys();
    expect(unpackTimeline(k.key, k.hostPub, packTimeline(other.key, tl, k.hostSecret))).toBeNull();
    expect(unpackTimeline(k.key, k.hostPub, 'not a message')).toBeNull();
  });

  it('refuses a signed but malformed timeline', () => {
    const k = newClassKeys();
    const bad = { ...tl, commands: [{ at: 'soon', action: 'explode' }] } as never;
    expect(unpackTimeline(k.key, k.hostPub, packTimeline(k.key, bad, k.hostSecret))).toBeNull();
  });
});
