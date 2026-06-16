/**
 * Feature flags.
 *
 * DONATIONS_ENABLED gates every Buy Me a Coffee surface — the Settings/About
 * support row, the timer-list support link, and the soft donation prompt. Set
 * false 2026-06-16: Apple rejects external donation links for a for-profit app
 * (App Store guideline 3.1.1 — must be In-App Purchase). Flip back to true once
 * the IAP tip jar replaces the BMAC link.
 */
export const DONATIONS_ENABLED: boolean = false;
