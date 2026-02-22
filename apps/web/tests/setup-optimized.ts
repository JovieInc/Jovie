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
process.env.STRIPE_PRICE_STANDARD_MONTHLY ??= 'price_pro_monthly';
process.env.STRIPE_PRICE_STANDARD_YEARLY ??= 'price_pro_yearly';
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

// Mock @sentry/nextjs globally to prevent heavy SDK initialization (~50-70KB)
// from causing test timeouts. Route handlers import @/lib/error-tracking which
// transitively loads Sentry, taking >10s in jsdom. Individual test files that
// need specific Sentry behavior can override this with their own vi.mock().
vi.mock('@sentry/nextjs', () => {
  const noop = vi.fn();
  const noopLogger = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    disable: vi.fn(),
    enable: vi.fn(),
    isEnabled: vi.fn(() => false),
  };
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    captureRequestError: vi.fn(),
    captureRouterTransitionStart: vi.fn(),
    addBreadcrumb: vi.fn(),
    withScope: vi.fn((cb: (scope: unknown) => void) =>
      cb({ setTag: noop, setExtra: noop, setLevel: noop })
    ),
    setTag: vi.fn(),
    setExtra: vi.fn(),
    setUser: vi.fn(),
    setContext: vi.fn(),
    init: vi.fn(),
    startSpan: vi.fn((_options: unknown, cb: () => unknown) => cb()),
    getClient: vi.fn(() => undefined),
    getCurrentScope: vi.fn(() => ({
      setTag: noop,
      setExtra: noop,
      setLevel: noop,
    })),
    logger: noopLogger,
    breadcrumbsIntegration: vi.fn(() => ({})),
    replayIntegration: vi.fn(() => ({})),
    vercelAIIntegration: vi.fn(() => ({})),
    diagnoseSdkConnectivity: vi.fn(),
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

// Auto-load browser globals for all tests (lightweight)
import './setup-browser';
