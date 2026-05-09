import { requireOptionalNativeModule } from 'expo';

import type {
  LiveTimerAvailability,
  LiveTimerStartInput,
  LiveTimerUpdateInput,
} from './types';

type Native = {
  getAvailability(): Promise<LiveTimerAvailability>;
  start(input: LiveTimerStartInput): Promise<void>;
  update(input: LiveTimerUpdateInput): Promise<void>;
  end(sessionId: string): Promise<void>;
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
};

const native = requireOptionalNativeModule<Native>('LiveTimerModule');

export default native ?? noop;
