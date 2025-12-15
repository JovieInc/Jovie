/**
 * Optimized Test Setup
 *
 * Minimal setup file that only loads essential mocks and defers heavy initialization.
 * Reduces setup time from 40s+ to under 5s by using lazy loading.
 *
 * Updated to trigger CI workflow after fixing lint command issue.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, vi } from 'vitest';

// Extend expect with jest-dom matchers
expect.extend(matchers);

// Load essential browser API mocks immediately
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn().mockReturnValue([]),
  root: null,
  rootMargin: '0px',
  thresholds: [],
}));

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

if (typeof window !== 'undefined' && !window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', {
    writable: true,
    value: vi.fn(),
  });
}

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

// Mock Clerk components with stable vi.fn hooks so tests can stub behavior
const mockUseUser = vi.fn(() => ({
  isSignedIn: false,
  user: null,
  isLoaded: true,
}));

const mockUseClerk = vi.fn(() => ({
  signOut: vi.fn(),
  openUserProfile: vi.fn(),
}));

const mockUseAuth = vi.fn(() => ({
  has: vi.fn(() => false),
}));

const mockUseSession = vi.fn(() => ({
  session: null,
  isLoaded: true,
}));

vi.mock('@clerk/nextjs', () => ({
  __esModule: true,
  useUser: mockUseUser,
  useClerk: mockUseClerk,
  useAuth: mockUseAuth,
  useSession: mockUseSession,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignIn: ({ children }: { children: React.ReactNode }) => children,
  SignUp: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () =>
    React.createElement('div', { 'data-testid': 'user-button' }, 'User Button'),
}));

// Mock server-only modules
vi.mock('server-only', () => ({
  default: vi.fn(),
}));

// Mock framer-motion to avoid loading the full animation library in fast tests
// while preserving basic structure.
vi.mock('framer-motion', () => {
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
});

// Mock @jovie/ui components (keep actual implementations to preserve tooltip context)
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');
  return {
    ...actual,
  };
});

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

// Mock notification hook to avoid needing actual toast provider
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

// Mock console methods to reduce noise
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

// Clean up DOM between tests
afterEach(() => {
  cleanup();
});

// Note: CSS imports and heavy mocks are now loaded on-demand
// Database setup is moved to specific test files that need it
// Component-specific mocks are loaded by individual test files
