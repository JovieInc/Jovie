// Import test matchers (lightweight, always needed)
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

expect.extend(matchers);

// Mock React's cache function globally for all tests
// React cache() is used in server components but doesn't work in test environment
// We mock it to pass through the function unchanged
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

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

// Load browser globals (always needed for jsdom)
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
