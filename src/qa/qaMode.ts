// Read at bundle time via Expo's EXPO_PUBLIC_* env inlining. Production
// builds set this to 0 (or unset); the e2e workflow sets it to 1 so the
// app boots with deterministic fixtures and skipped navigation animations.
export const QA_MODE = process.env.EXPO_PUBLIC_QA_MODE === '1';
