/**
 * Minimal setup file for fast tests (node environment)
 *
 * This setup file is optimized for pure logic tests that don't need DOM.
 * Use the main setup.ts for tests requiring jsdom/React testing.
 */

// Suppress noisy runtime warnings in tests
global.console = {
  ...console,
  debug: () => {},
  warn: () => {},
};
