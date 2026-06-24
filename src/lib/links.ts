import { Linking } from 'react-native';
import { buildFeedbackEmailUrl } from '../utils/feedback';

export const BMAC_URL = 'https://buymeacoffee.com/jtysonwilliams';

export function openUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}

export function openFeedbackMail(): void {
  Linking.openURL(buildFeedbackEmailUrl()).catch(() => {});
}
