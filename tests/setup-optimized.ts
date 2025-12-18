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
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
}

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

// Mock Clerk components (fast setup) – keep in sync with tests/setup.ts
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

// Mock @jovie/ui components (including TooltipProvider/Tooltip) for fast tests
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');

  const MockTooltipProvider = ({
    children,
  }: {
    children: React.ReactNode;
  }) => React.createElement(React.Fragment, {}, children);

  const MockTooltip = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      'div',
      { 'data-testid': 'tooltip-wrapper-fast' },
      children,
    );

  const MockTooltipTrigger = React.forwardRef<
    HTMLElement,
    { asChild?: boolean; children: React.ReactNode }
  >(({ children, asChild }, ref) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement, { ref });
    }
    return React.createElement('button', { ref }, children);
  });
  MockTooltipTrigger.displayName = 'MockTooltipTriggerFast';

  const MockTooltipContent = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      'div',
      { 'data-testid': 'tooltip-content-fast', role: 'tooltip' },
      children,
    );

  return {
    ...actual,
    TooltipProvider: MockTooltipProvider,
    Tooltip: MockTooltip,
    TooltipTrigger: MockTooltipTrigger,
    TooltipContent: MockTooltipContent,
  };
});

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
