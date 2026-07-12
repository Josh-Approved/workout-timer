import { Platform } from 'react-native';
import Constants from 'expo-constants';

const FEEDBACK_EMAIL = 'feedback@joshapproved.com';

function getDeviceModel(): string {
  try {
    // expo-device requires a native build — falls back to placeholder if unavailable
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device');
    return Device.modelName ?? '[device model]';
  } catch {
    return '[device model]';
  }
}

export function buildFeedbackEmailUrl(): string {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const osVersion = String(Platform.Version);
  const model = getDeviceModel();

  const subject = encodeURIComponent('Workout Timer Feedback');

  const body = encodeURIComponent(
    [
      'Hi,',
      '',
      '[Replace this with your feedback, or fill in the bug report below]',
      '',
      '---',
      'BUG REPORT (delete if not applicable)',
      '',
      'Whenever I try to [describe the action],',
      '[the unexpected thing] happens.',
      '',
      'It should instead [describe what you expected].',
      '',
      '---',
      `App: Workout Timer v${version}`,
      `Device: ${model} (${platform} ${osVersion})`,
    ].join('\n')
  );

  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
}
