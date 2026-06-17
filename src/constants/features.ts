/**
 * Feature flags.
 *
 * DONATIONS_ENABLED gates the legacy Buy Me a Coffee link-out. Set false
 * 2026-06-16: Apple rejects external donation links for a for-profit app (App
 * Store guideline 3.1.1 — must be In-App Purchase). It stays false — the BMAC
 * link-out is the rejected surface; the IAP tip jar replaces it.
 *
 * TIP_JAR_ENABLED gates the IAP tip jar — the sanctioned 3.1.1 replacement. It
 * powers the same three placements the donation surfaces used (the Settings
 * "Support" row, the timer-list support link, and the twice-only soft prompt),
 * each now opening the canonical TipJarSheet instead of a browser link.
 */
export const DONATIONS_ENABLED: boolean = false;

export const TIP_JAR_ENABLED: boolean = true;
