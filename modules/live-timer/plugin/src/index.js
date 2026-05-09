// Expo config plugin for live-timer.
// Handles Info.plist (Live Activities + audio background mode) and the
// Android manifest (foreground service + permissions). The iOS widget
// extension target is managed by @bacons/apple-targets via the
// targets/<name>/ directory in the host app — this plugin does not
// touch the Xcode project.

const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

function withLiveTimerInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.NSSupportsLiveActivities = true;
    cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;

    const existing = Array.isArray(cfg.modResults.UIBackgroundModes)
      ? cfg.modResults.UIBackgroundModes
      : [];
    if (!existing.includes('audio')) {
      cfg.modResults.UIBackgroundModes = [...existing, 'audio'];
    }
    return cfg;
  });
}

function withLiveTimerAndroidManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) return cfg;

    const services = app.service ?? (app.service = []);
    const exists = services.some(
      (s) => s.$?.['android:name'] === 'expo.modules.livetimer.LiveTimerService'
    );
    if (!exists) {
      services.push({
        $: {
          'android:name': 'expo.modules.livetimer.LiveTimerService',
          'android:foregroundServiceType': 'mediaPlayback',
          'android:exported': 'false',
        },
      });
    }

    const receivers = app.receiver ?? (app.receiver = []);
    const receiverExists = receivers.some(
      (r) => r.$?.['android:name'] === 'expo.modules.livetimer.LiveTimerActionReceiver'
    );
    if (!receiverExists) {
      receivers.push({
        $: {
          'android:name': 'expo.modules.livetimer.LiveTimerActionReceiver',
          'android:exported': 'false',
        },
      });
    }

    const manifest = cfg.modResults.manifest;
    const perms = manifest['uses-permission'] ?? (manifest['uses-permission'] = []);
    const required = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
    ];
    for (const name of required) {
      if (!perms.some((p) => p.$?.['android:name'] === name)) {
        perms.push({ $: { 'android:name': name } });
      }
    }

    return cfg;
  });
}

const withLiveTimer = (config) => {
  config = withLiveTimerInfoPlist(config);
  config = withLiveTimerAndroidManifest(config);
  return config;
};

module.exports = withLiveTimer;
