/**
 * The class relay's liveness (class/relay.ts ClassRelay): the instructor
 * re-deposits the timeline as a heartbeat; a member calls itself live only
 * while it actually hears the instructor, and reconnects when an open link
 * goes quiet — the "shows Live but hears nothing" failure.
 */

const mockTransports: Array<{
  mockOnMessage: (ct: string, at: number) => void;
  mockOnStatus?: (n: number) => void;
  published: string[];
  closed: boolean;
}> = [];

jest.mock('../../sync/transport', () => ({
  DropBoxTransport: class {
    published: string[] = [];
    closed = false;
    constructor(
      _mockChannel: string,
      public mockOnMessage: (mockCt: string, mockAt: number) => void,
      _mockOnConnect?: () => void,
      public mockOnStatus?: (mockN: number) => void,
    ) {
      mockTransports.push(this);
    }
    start() {}
    close() {
      this.closed = true;
    }
    publishStored(mockCt: string) {
      this.published.push(mockCt);
    }
    publish() {}
  },
}));

import { ClassRelay, newClassKeys, packTimeline, HEARTBEAT_MS, SILENCE_MS } from '../relay';
import { newTimeline } from '../timeline';

beforeEach(() => {
  mockTransports.length = 0;
  jest.useFakeTimers({ now: 1_000_000 });
});
afterEach(() => jest.useRealTimers());

describe('class relay liveness', () => {
  const keys = newClassKeys();
  const tl = newTimeline(5_000);

  it('the instructor re-deposits the timeline as a heartbeat', () => {
    const relay = new ClassRelay({ ...keys, hostPub: keys.hostPub, onTimeline: () => {}, onLive: () => {} });
    relay.start();
    relay.publish(tl);
    jest.advanceTimersByTime(HEARTBEAT_MS * 3);
    expect(mockTransports[0].published.length).toBe(4);
    relay.close();
  });

  it('a member is live only while it hears the instructor, and reconnects when the link goes quiet', () => {
    const live: boolean[] = [];
    const relay = new ClassRelay({
      key: keys.key,
      hostPub: keys.hostPub,
      onTimeline: () => {},
      onLive: (l) => live.push(l),
    });
    relay.start();
    mockTransports[0].mockOnStatus?.(3); // sockets open...
    expect(live.at(-1)).toBe(false); // ...but nothing heard yet
    mockTransports[0].mockOnMessage(packTimeline(keys.key, tl, keys.hostSecret), Date.now());
    expect(live.at(-1)).toBe(true);
    jest.advanceTimersByTime(SILENCE_MS + 5_000); // open but silent
    expect(live.at(-1)).toBe(false);
    expect(mockTransports[0].closed).toBe(true);
    expect(mockTransports).toHaveLength(2); // a fresh connection, which replays the latest deposit
    relay.close();
  });
});
