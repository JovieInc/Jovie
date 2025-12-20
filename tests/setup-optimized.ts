/**
 * Optimized Test Setup
 *
 * Ultra-minimal setup file that only loads essential matchers and browser globals.
 * All mocks are lazy-loaded by individual tests as needed.
 * Reduces setup time significantly by deferring all heavy initialization.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

// Extend expect with jest-dom matchers (lightweight, always needed)
expect.extend(matchers);

// Ensure the DOM is cleaned up between tests to avoid cross-test interference
afterEach(() => {
  cleanup();
});

// Suppress noisy runtime warnings that depend on optional integrations in tests.
global.console = {
  ...console,
  debug: () => {},
  warn: () => {},
};

// Load browser globals (always needed for jsdom, lightweight)
export { setupBrowserGlobals } from './setup-browser';
// Load database setup ONLY for integration tests
// Integration tests should import './setup-db' explicitly
// Unit tests skip this entirely
export { setupDatabase } from './setup-db';
// Load component mocks ONLY for component tests
// Tests that need these should import './setup-mocks' explicitly
export { setupComponentMocks } from './setup-mocks';

// Auto-load browser globals for all tests (lightweight)
import './setup-browser';
