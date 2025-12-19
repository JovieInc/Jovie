/**
 * Lazy Mock Loading System
 *
 * Provides on-demand loading of mocks to reduce setup time.
 * Only loads mocks when they're actually needed by tests.
 */

import React from 'react';
import { vi } from 'vitest';

// Track which mocks have been loaded to avoid duplicate initialization
const loadedMocks = new Set<string>();

/**
 * Lazy load Clerk mocks only when needed
 */
export function loadClerkMocks() {
  if (loadedMocks.has('clerk')) return;

  vi.mock('@clerk/nextjs', () => ({
    useUser: () => ({
      isSignedIn: false,
      user: null,
      isLoaded: true,
    }),
    useAuth: () => ({
      has: vi.fn(() => false),
    }),
    useSession: () => ({
      session: null,
      isLoaded: true,
    }),
    ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
    SignIn: ({ children }: { children: React.ReactNode }) => children,
    SignUp: ({ children }: { children: React.ReactNode }) => children,
    SignInButton: ({ children }: { children: React.ReactNode }) => children,
    SignUpButton: ({ children }: { children: React.ReactNode }) => children,
    UserButton: () =>
      React.createElement(
        'div',
        { 'data-testid': 'user-button' },
        'User Button'
      ),
  }));

  loadedMocks.add('clerk');
}

/**
 * Lazy load feature flag mocks only when needed
 */
export function loadFeatureFlagMocks() {
  if (loadedMocks.has('feature-flags')) return;

  vi.mock('@/components/providers/FeatureFlagsProvider', () => ({
    useFeatureFlags: () => ({
      flags: {
        waitlistEnabled: false,
        artistSearchEnabled: true,
        debugBannerEnabled: false,
        tipPromoEnabled: true,
        profileSettingsEnabled: true,
      },
    }),
  }));

  loadedMocks.add('feature-flags');
}

/**
 * Lazy load Next.js mocks only when needed
 */
export function loadNextJsMocks() {
  if (loadedMocks.has('nextjs')) return;

  // Mock Next.js Image component
  vi.mock('next/image', () => ({
    default: ({
      src,
      alt,
      width,
      height,
      className,
      ...props
    }: React.ComponentProps<'img'>) => {
      return React.createElement('img', {
        src,
        alt,
        width,
        height,
        className,
        'data-testid': 'next-image',
        ...props,
      });
    },
  }));

  loadedMocks.add('nextjs');
}

/**
 * Lazy load Next.js navigation mocks only when needed
 */
export function loadNextNavigationMocks() {
  if (loadedMocks.has('next-navigation')) return;

  vi.mock('next/navigation', () => {
    return {
      useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        refresh: vi.fn(),
        prefetch: vi.fn().mockResolvedValue(undefined),
      }),
      usePathname: () => '/',
      useSearchParams: () => new URLSearchParams(),
    };
  });

  loadedMocks.add('next-navigation');
}

/**
 * Lazy load browser API mocks only when needed
 */
export function loadBrowserApiMocks() {
  if (loadedMocks.has('browser-apis')) return;

  // Mock ResizeObserver
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  }

  // Mock IntersectionObserver
  if (typeof global.IntersectionObserver === 'undefined') {
    global.IntersectionObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));
  }

  // Mock matchMedia
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  // Mock window.scrollTo
  if (typeof window !== 'undefined' && !window.scrollTo) {
    Object.defineProperty(window, 'scrollTo', {
      writable: true,
      value: vi.fn(),
    });
  }

  loadedMocks.add('browser-apis');
}

/**
 * Lazy load server-only mocks only when needed
 */
export function loadServerOnlyMocks() {
  if (loadedMocks.has('server-only')) return;

  vi.mock('server-only', () => ({
    default: vi.fn(),
  }));

  loadedMocks.add('server-only');
}

/**
 * Lazy load notification hook mocks only when needed
 */
export function loadNotificationsMocks() {
  if (loadedMocks.has('notifications')) return;

  vi.mock('@/lib/hooks/useNotifications', () => ({
    useNotifications: () => ({
      showToast: vi.fn(),
      hideToast: vi.fn(),
      clearToasts: vi.fn(),
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
      undo: vi.fn(),
      retry: vi.fn(),
      saveSuccess: vi.fn(),
      saveError: vi.fn(),
      uploadSuccess: vi.fn(),
      uploadError: vi.fn(),
      networkError: vi.fn(),
      genericError: vi.fn(),
      handleError: vi.fn(),
      withLoadingToast: vi.fn(),
    }),
  }));

  loadedMocks.add('notifications');
}

// Define mocked components outside the function to avoid hoisting issues
const MockedHeadlessUiComponents = {
  // Dialog components
  Dialog: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'dialog' });
    }
  ),
  DialogPanel: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  DialogTitle: React.forwardRef<HTMLHeadingElement, React.ComponentProps<'h2'>>(
    (props, ref) => {
      return React.createElement('h2', { ...props, ref });
    }
  ),
  // Add other components as needed...
  Input: React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    (props, ref) => {
      return React.createElement('input', { ...props, ref });
    }
  ),
};

// Add display names
MockedHeadlessUiComponents.Dialog.displayName = 'MockedDialog';
MockedHeadlessUiComponents.DialogPanel.displayName = 'MockedDialogPanel';
MockedHeadlessUiComponents.DialogTitle.displayName = 'MockedDialogTitle';
MockedHeadlessUiComponents.Input.displayName = 'MockedInput';

/**
 * Lazy load Headless UI mocks only when needed
 */
export function loadHeadlessUiMocks() {
  if (loadedMocks.has('headless-ui')) return;

  vi.mock('@headlessui/react', () => MockedHeadlessUiComponents);

  loadedMocks.add('headless-ui');
}

/**
 * Lazy load framer-motion mocks only when needed
 */
export function loadFramerMotionMocks() {
  if (loadedMocks.has('framer-motion')) return;

  vi.mock('framer-motion', () => createFramerMotionMock());

  loadedMocks.add('framer-motion');
}

export function createFramerMotionMock() {
  const MockAnimatePresence = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);

  const MockMotionComponent: React.FC<
    React.HTMLAttributes<HTMLDivElement>
  > = props => React.createElement('div', props);

  const motion = new Proxy(MockMotionComponent, {
    get: () => MockMotionComponent,
  });

  return {
    __esModule: true,
    AnimatePresence: MockAnimatePresence,
    motion,
  };
}

/**
 * Lazy load @jovie/ui mocks only when needed
 */
export function loadJovieUiMocks() {
  if (loadedMocks.has('@jovie/ui')) return;

  vi.mock('@jovie/ui', async () => {
    const actual =
      await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');
    return {
      __esModule: true,
      ...actual,
    };
  });

  loadedMocks.add('@jovie/ui');
}

/**
 * Load only the essential mocks needed for most tests
 */
export function loadEssentialMocks() {
  loadBrowserApiMocks();
  loadNextJsMocks();
  loadServerOnlyMocks();

  // Mock console methods to reduce noise
  global.console = {
    ...console,
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/**
 * Load all mocks (for compatibility with existing tests)
 */
export function loadAllMocks() {
  loadEssentialMocks();
  loadClerkMocks();
  loadFeatureFlagMocks();
  loadNextJsMocks();
  loadHeadlessUiMocks();
  loadFramerMotionMocks();
  loadJovieUiMocks();
  loadNextNavigationMocks();
  loadNotificationsMocks();
}

/**
 * Reset all loaded mocks (useful for test isolation)
 */
export function resetMocks() {
  loadedMocks.clear();
  vi.clearAllMocks();
}
