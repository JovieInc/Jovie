/**
 * Optimized Test Setup
 *
 * Ultra-minimal setup file that only loads essential matchers and browser globals.
 * All mocks are lazy-loaded by individual tests as needed.
 * Reduces setup time significantly by deferring all heavy initialization.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect, vi } from 'vitest';

// Extend expect with jest-dom matchers (lightweight, always needed)
expect.extend(matchers);

// Baseline env vars for fast/unit tests (see `tests/setup.ts` for details).
process.env.VITEST ??= 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.URL_ENCRYPTION_KEY ??= 'test-encryption-key-32-chars!!';
process.env.STRIPE_PRICE_PRO_MONTHLY ??= 'price_pro_monthly';
process.env.STRIPE_PRICE_PRO_YEARLY ??= 'price_pro_yearly';
process.env.STRIPE_PRICE_INTRO_MONTHLY ??= 'price_pro';
process.env.STRIPE_PRICE_INTRO_YEARLY ??= 'price_pro_yearly';

// Mock React's cache function globally for all tests so server components using
// cache() continue to work in the fast config without requiring a full Next.js
// request context.
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

// Auto-load browser globals for all tests (lightweight)
import './setup-browser';
