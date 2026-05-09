import { requireNativeModule } from 'expo';

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
};

export default requireNativeModule<Native>('LiveTimerModule');
