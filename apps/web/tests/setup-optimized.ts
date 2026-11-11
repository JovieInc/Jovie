/**
 * Optimized Test Setup
 *
 * Ultra-minimal setup file that only loads essential matchers and browser globals.
 * All mocks are lazy-loaded by individual tests as needed.
 * Reduces setup time significantly by deferring all heavy initialization.
 *
 * DOM testing pieces (jest-dom matchers, React Testing Library cleanup) load
 * only when a DOM exists. Files listed in tests/node-environment-files.json run
 * in Vitest's `node` environment, never render, and never use jest-dom
 * matchers (tests/unit/ci/node-environment-files.test.ts enforces both), so
 * they skip that import cost. Every other global below applies to both.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, vi } from 'vitest';
import { releaseIdleAuthClient } from './auth-client-test-hooks';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

if (process.cwd() !== appRoot) {
  process.chdir(appRoot);
}

// Merge-time pilot: true when Vitest's RESOLVED isolation setting is off
// (vitest.config.fast.mts injects VITEST_ISOLATION_OFF into test.env). The
// default — unset, or any other value — keeps per-file isolation and the
// original cleanup hook below.
const isolationOff = process.env.VITEST_ISOLATION_OFF === 'true';

// Captured from the dynamic Testing Library import below when a DOM exists;
// used by the isolate-off unwind so it can order RTL cleanup first.
let domCleanup: (() => void) | null = null;

if (typeof window !== 'undefined') {
  const [matchers, { cleanup }] = await Promise.all([
    import('@testing-library/jest-dom/matchers'),
    import('@testing-library/react'),
  ]);

  // Extend expect with jest-dom matchers. The dynamic import's namespace also
  // carries the CommonJS `default` export, which is not a matcher.
  const { default: _commonJsDefault, ...jestDomMatchers } = matchers;
  expect.extend(jestDomMatchers);

  // Captured for the isolate-off unwind below; stays null in
  // node-environment files (no DOM, no Testing Library).
  domCleanup = cleanup;

  // Ensure the DOM is cleaned up between tests to avoid cross-test interference
  if (!isolationOff) {
    afterEach(() => {
      cleanup();
      // Run after Testing Library unmounts, while jsdom's `window` still exists.
      releaseIdleAuthClient();
    });
  }
}

// Merge-time pilot (isolation off, one opt-in shard): the unwind is gated on
// the RESOLVED isolation setting — vitest.config.fast.mts computes it (CLI
// --isolate/--no-isolate wins over the VITEST_ISOLATE string) and injects it
// here as VITEST_ISOLATION_OFF, so the raw env string can never desync from
// what Vitest actually does. Isolate:true runs register no extra cleanup.
//
// Vitest runs after-hooks in REVERSE registration order, so the pilot does NOT
// register separate unwinds (they would run backwards). One controlled hook
// owns everything in a fixed order: RTL cleanup -> auth disposal ->
// mock/global/env/timer restore -> residual DOM/storage clear. Beyond this
// baseline, a test file must still unwind anything custom it mutates (module
// singletons, listeners on window/document, servers/connections).
// Runs each unwind step in order; a throwing step never skips the later
// ones — the first error is rethrown only after every step has run.
// Exported for the unwind regression tests.
export function runUnwindSteps(steps: Array<() => void>): void {
  const errors: unknown[] = [];
  for (const runStep of steps) {
    try {
      runStep();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) throw errors[0];
}

if (isolationOff) {
  afterEach(() => {
    runUnwindSteps([
      // 1-2. Testing Library unmounts, then the auth client is disposed while
      // jsdom's `window` still exists.
      () => {
        if (domCleanup) domCleanup();
        if (typeof window !== 'undefined') releaseIdleAuthClient();
      },
      // 3. Restore what Vitest primitives own.
      () => vi.restoreAllMocks(),
      () => vi.unstubAllEnvs(),
      () => vi.unstubAllGlobals(),
      // A file that calls vi.useFakeTimers() at MODULE scope is incompatible
      // with pilot mode — move fake timers into beforeEach (leak-fix follow-up).
      () => vi.useRealTimers(),
      // 4. Residual DOM/storage from the previous test's leftovers.
      () => {
        if (typeof window !== 'undefined') {
          document.body.innerHTML = '';
          window.localStorage.clear();
          window.sessionStorage.clear();
        }
      },
    ]);
  });
}

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
    captureCheckIn: vi.fn(() => 'check-in-id'),
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
vi.mock('next/navigation', () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };

  return {
    useRouter: () => router,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

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
function createInertMotionValue<T>(initial: T) {
  let current = initial;
  return {
    get: () => current,
    set: (next: T) => {
      current = next;
    },
    jump: (next: T) => {
      current = next;
    },
    on: () => () => {},
    destroy: () => {},
  };
}

vi.mock('motion/react', async () => {
  const React = await import('react');
  // Table tags have to stay real elements. Dropping the wrapper (the default
  // for every other motion tag) removes the cell and breaks row semantics.
  const tableTags = new Set([
    'caption',
    'col',
    'colgroup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
  ]);
  const passthrough = ({ children }: { children?: unknown }) =>
    children ?? null;
  const tableComponents = new Map<string, typeof passthrough>();
  return {
    MotionGlobalConfig: { skipAnimations: false },
    AnimatePresence: ({ children }: { children: unknown }) => children,
    LazyMotion: ({ children }: { children: unknown }) => children,
    motion: new Proxy(
      {},
      {
        get: (_target, tag) => {
          const element = typeof tag === 'string' ? tag : 'div';
          if (!tableTags.has(element)) return passthrough;
          const cached = tableComponents.get(element);
          if (cached) return cached;
          const MotionTable = ({
            children,
            ...props
          }: Record<string, unknown>) => {
            const domProps: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(props)) {
              if (
                key === 'animate' ||
                key === 'exit' ||
                key === 'initial' ||
                key === 'layout' ||
                key === 'layoutId' ||
                key === 'transition' ||
                key === 'variants' ||
                key.startsWith('onAnimation') ||
                key.startsWith('while')
              ) {
                continue;
              }
              domProps[key] = value;
            }
            return React.createElement(
              element,
              domProps,
              children as React.ReactNode
            );
          };
          tableComponents.set(element, MotionTable);
          return MotionTable;
        },
      }
    ),
    useReducedMotion: () => false,
    // Motion-value hooks return inert stand-ins; the proxied `motion.*`
    // components above never read them.
    useMotionValue: createInertMotionValue,
    useSpring: createInertMotionValue,
    useTransform: () => createInertMotionValue(undefined),
    useVelocity: () => createInertMotionValue(0),
  };
});

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
  useClerk: () => ({
    setActive: async () => {},
  }),
  useSignIn: () => ({
    isLoaded: true,
    fetchStatus: 'idle',
    errors: [],
    signIn: null,
  }),
  useSignUp: () => ({
    fetchStatus: 'idle',
    errors: [],
    signUp: null,
  }),
  SignedIn: ({ children }: { children: unknown }) => null,
  SignedOut: ({ children }: { children: unknown }) => children,
  ClerkProvider: ({ children }: { children: unknown }) => children,
}));

// Suppress noisy runtime warnings that depend on optional integrations in tests.
global.console = {
  ...console,
  debug: () => {},
  warn: () => {},
};

// Auto-load browser globals for all tests (lightweight)
import './setup-browser';
