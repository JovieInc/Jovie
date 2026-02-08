// Import test matchers (lightweight, always needed)
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

expect.extend(matchers);

// Provide baseline env vars for unit tests. These are intentionally lightweight
// defaults that keep server-only helpers from failing fast when environment
// variables aren't configured in the test runtime.
process.env.VITEST ??= 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.URL_ENCRYPTION_KEY ??= 'test-encryption-key-32-chars!!';
process.env.STRIPE_PRICE_PRO_MONTHLY ??= 'price_pro_monthly';
process.env.STRIPE_PRICE_PRO_YEARLY ??= 'price_pro_yearly';
process.env.STRIPE_PRICE_INTRO_MONTHLY ??= 'price_pro';
process.env.STRIPE_PRICE_INTRO_YEARLY ??= 'price_pro_yearly';

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

// `server-only` throws when imported in non-Next runtimes; tests should noop it.
vi.mock('server-only', () => ({}));

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
