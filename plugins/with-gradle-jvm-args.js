// Override android/gradle.properties' org.gradle.jvmargs at prebuild time.
//
// Why: Expo's default of `-Xmx2048m -XX:MaxMetaspaceSize=512m` runs out of
// Metaspace on ubuntu-latest CI runners during `:expo-updates:kspReleaseKotlin`
// and lint analysis. The project gradle.properties takes precedence over the
// GRADLE_OPTS env var, so the override has to land in the file itself.
//
// EAS local builds run prebuild internally and regenerate gradle.properties
// from the Expo template every build, so a one-shot file edit doesn't stick.
// A config plugin is the canonical Expo way to mutate this file at the right
// step in the pipeline.

const { withGradleProperties } = require('expo/config-plugins');

const KEY = 'org.gradle.jvmargs';
const VALUE = '-Xmx4g -XX:MaxMetaspaceSize=1g';

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const i = props.findIndex((p) => p.type === 'property' && p.key === KEY);
    const entry = { type: 'property', key: KEY, value: VALUE };
    if (i >= 0) props[i] = entry;
    else props.push(entry);
    return cfg;
  });
};
