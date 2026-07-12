/**
 * Canonical external links + the runtime version string. App-OWNED — one place
 * so the Settings rows and the review modal stay byte-identical.
 */

import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';

export const APP_NAME = 'Workout Timer - Josh Approved';

export const IOS_APP_STORE_ID = '6767314178';
export const ANDROID_PACKAGE = 'com.joshapproved.freeworkouttimer';

export const BMAC_URL = 'https://buymeacoffee.com/jtysonwilliams';
export const STUDIO_URL = 'https://joshapproved.com';
export const REPO_URL = 'https://github.com/Josh-Approved/workout-timer';
export const PRIVACY_URL =
  'https://github.com/Josh-Approved/workout-timer/blob/main/PRIVACY.md';

/** `1.2.0 (47)` — read from the bundle at runtime, never hardcoded. */
export function versionLabel(): string {
  const v = Application.nativeApplicationVersion ?? '1.0.0';
  const b = Application.nativeBuildVersion ?? '1';
  return `${v} (${b})`;
}

export function openUrl(url: string): void {
  Linking.openURL(url).catch(() => {});
}

export function openBmac(): void {
  openUrl(BMAC_URL);
}

export function openFeedbackMail(): void {
  const subject = encodeURIComponent(`${APP_NAME} ${versionLabel()}`);
  openUrl(`mailto:feedback@joshapproved.com?subject=${subject}`);
}

/** iOS write-review deep link pinned to the modern apps.apple.com host. */
export function openReview(): void {
  const url =
    Platform.OS === 'ios'
      ? `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}?action=write-review`
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`;
  openUrl(url);
}
