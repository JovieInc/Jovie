/**
 * Stable reference instant for canonical demo fixtures and their screenshots.
 *
 * Demo fixture dates are intentionally static. Passing the same reference
 * instant through SSR, hydration, and Playwright keeps relative date labels
 * deterministic instead of comparing server and browser wall clocks.
 */
export const DEMO_REFERENCE_CLOCK_ISO = '2026-04-15T16:00:00.000Z';
