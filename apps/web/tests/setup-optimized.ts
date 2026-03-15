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

// Mock @/lib/sentry/client-lite globally — client components now import Sentry
// helpers from the lite wrapper instead of `@sentry/nextjs` directly.
vi.mock('@/lib/sentry/client-lite', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  onRouterTransitionStart: vi.fn(),
  initLiteSentry: vi.fn(() => false),
  isLiteSentryInitialized: vi.fn(() => false),
  getSentryClient: vi.fn(() => undefined),
  getLiteClientConfig: vi.fn(() => ({})),
}));

// Mock next/navigation — commonly needed in tests that import components using
// useRouter, usePathname, or useSearchParams. Missing mocks cause slow dynamic
// import resolution that degrades p95 performance.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Mock next/headers — avoids errors when server components call cookies() or
// headers() outside of a real Next.js request context.
vi.mock('next/headers', () => ({
  headers: () => new Headers(),
  cookies: () => ({
    get: vi.fn(() => undefined),
    getAll: vi.fn(() => []),
    has: vi.fn(() => false),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock next/cache — revalidatePath/revalidateTag are no-ops in unit tests;
// calling the real implementations outside Next.js throws an invariant error.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  unstable_noStore: vi.fn(),
}));

// Mock animation and UI-heavy dependencies globally to reduce per-file mock
// setup overhead in component tests.
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: unknown }) => children,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: Record<string, unknown>) =>
          children ?? null,
    }
  ),
}));

vi.mock('@headlessui/react', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const passthrough = (name: string) => {
    const HeadlessPassthrough = ({
      children,
      ...props
    }: Record<string, unknown>) =>
      React.createElement(
        'div',
        { ...props, 'data-headlessui': name },
        children as React.ReactNode
      );

    HeadlessPassthrough.displayName = `HeadlessUiMock(${name})`;
    return HeadlessPassthrough;
  };

  return {
    Dialog: passthrough('dialog'),
    DialogPanel: passthrough('dialog-panel'),
    DialogTitle: passthrough('dialog-title'),
    Transition: passthrough('transition'),
    TransitionChild: passthrough('transition-child'),
    Menu: passthrough('menu'),
    MenuButton: passthrough('menu-button'),
    MenuItems: passthrough('menu-items'),
    MenuItem: passthrough('menu-item'),
    Listbox: passthrough('listbox'),
    ListboxButton: passthrough('listbox-button'),
    ListboxOptions: passthrough('listbox-options'),
    ListboxOption: passthrough('listbox-option'),
  };
});

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null }),
  SignedIn: ({ children }: { children: unknown }) => children,
  SignedOut: ({ children }: { children: unknown }) => children,
  ClerkProvider: ({ children }: { children: unknown }) => children,
}));

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
