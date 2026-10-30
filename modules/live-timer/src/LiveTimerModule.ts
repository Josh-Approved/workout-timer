import { requireOptionalNativeModule } from 'expo';

import type {
  AudioOutput,
  LiveTimerAvailability,
  LiveTimerStartInput,
  LiveTimerUpdateInput,
} from './types';

type Native = {
  getAvailability(): Promise<LiveTimerAvailability>;
  start(input: LiveTimerStartInput): Promise<void>;
  update(input: LiveTimerUpdateInput): Promise<void>;
  end(sessionId: string): Promise<void>;
  nowMs(): number;
  wakeAfter(id: string, delayMs: number): void;
  cancelWake(id: string): void;
  getAudioOutput?(): Promise<AudioOutput | null>;
  addListener?: (name: string, cb: (...args: unknown[]) => void) => unknown;
};

// Defensive: the host app should never crash on launch if the native module
// failed to register (autolinking miss, iOS < 16.1 stripping, etc.). Fall
// back to safe stubs that report unavailability and accept calls as no-ops.
const noop: Native = {
  getAvailability: async () => ({
    supported: false,
    enabled: false,
    reason: 'native_module_unavailable',
  }),
  start: async () => {},
  update: async () => {},
  end: async () => {},
  nowMs: () => Date.now(),
  wakeAfter: () => {},
  cancelWake: () => {},
  getAudioOutput: async () => null,
};

const native = requireOptionalNativeModule<Native>('LiveTimerModule');

export default native ?? noop;
