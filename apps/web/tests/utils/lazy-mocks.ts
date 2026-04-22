/**
 * Shared lightweight mocks for fast component tests.
 *
 * Vitest hoists every `vi.mock()` call, so defining them inside helper
 * functions creates warnings and makes execution order misleading. Keep the
 * module-level mocks here, then expose no-op loaders so existing helpers keep
 * working without changing call sites.
 */

import React from 'react';
import { vi } from 'vitest';

const clerkState = {
  useUser: () => ({
    isSignedIn: false,
    user: null,
    isLoaded: true,
  }),
  useAuth: () => ({
    has: vi.fn(() => false),
    isLoaded: true,
    isSignedIn: false,
    userId: null,
  }),
  useSession: () => ({
    session: null,
    isLoaded: true,
  }),
  useClerk: () => ({
    signOut: vi.fn(),
    openUserProfile: vi.fn(),
    setActive: vi.fn(),
  }),
};

const headlessPassthrough = (name: string) => {
  const MockComponent = React.forwardRef<
    HTMLDivElement,
    Record<string, unknown>
  >(({ children, ...props }, ref) =>
    React.createElement(
      'div',
      { ...props, ref, 'data-headlessui': name },
      children as React.ReactNode
    )
  );

  MockComponent.displayName = `HeadlessUiMock(${name})`;
  return MockComponent;
};

vi.mock('@clerk/nextjs', () => ({
  useUser: clerkState.useUser,
  useAuth: clerkState.useAuth,
  useSession: clerkState.useSession,
  useClerk: clerkState.useClerk,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignIn: ({ children }: { children: React.ReactNode }) => children,
  SignUp: ({ children }: { children: React.ReactNode }) => children,
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignUpButton: ({ children }: { children: React.ReactNode }) => children,
  UserButton: () =>
    React.createElement('div', { 'data-testid': 'user-button' }, 'User Button'),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
    ...props
  }: React.ComponentProps<'img'>) =>
    React.createElement('img', {
      src,
      alt,
      width,
      height,
      className,
      'data-testid': 'next-image',
      ...props,
    }),
}));

vi.mock('@headlessui/react', () => ({
  Dialog: headlessPassthrough('dialog'),
  DialogPanel: headlessPassthrough('dialog-panel'),
  DialogTitle: headlessPassthrough('dialog-title'),
  Menu: headlessPassthrough('menu'),
  MenuButton: headlessPassthrough('menu-button'),
  MenuItems: headlessPassthrough('menu-items'),
  MenuItem: headlessPassthrough('menu-item'),
  Listbox: headlessPassthrough('listbox'),
  ListboxButton: headlessPassthrough('listbox-button'),
  ListboxOptions: headlessPassthrough('listbox-options'),
  ListboxOption: headlessPassthrough('listbox-option'),
  Combobox: headlessPassthrough('combobox'),
  ComboboxInput: headlessPassthrough('combobox-input'),
  ComboboxButton: headlessPassthrough('combobox-button'),
  ComboboxOptions: headlessPassthrough('combobox-options'),
  ComboboxOption: headlessPassthrough('combobox-option'),
  Popover: headlessPassthrough('popover'),
  PopoverButton: headlessPassthrough('popover-button'),
  PopoverPanel: headlessPassthrough('popover-panel'),
  Switch: headlessPassthrough('switch'),
  TabGroup: headlessPassthrough('tab-group'),
  TabList: headlessPassthrough('tab-list'),
  Tab: headlessPassthrough('tab'),
  TabPanels: headlessPassthrough('tab-panels'),
  TabPanel: headlessPassthrough('tab-panel'),
  Transition: headlessPassthrough('transition'),
  TransitionChild: headlessPassthrough('transition-child'),
  Input: headlessPassthrough('input'),
}));

vi.mock('server-only', () => ({}));

function ensureBrowserApis() {
  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = vi.fn().mockImplementation(function (this: any) {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
  }

  if (typeof global.IntersectionObserver === 'undefined') {
    global.IntersectionObserver = vi.fn().mockImplementation(function (
      this: any
    ) {
      this.observe = vi.fn();
      this.unobserve = vi.fn();
      this.disconnect = vi.fn();
    });
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
}

export function loadClerkMocks() {}

export function loadNextJsMocks() {}

export function loadHeadlessUiMocks() {}

export function loadBrowserApiMocks() {
  ensureBrowserApis();
}

export function loadEssentialMocks() {
  ensureBrowserApis();
}

export function loadAllMocks() {
  ensureBrowserApis();
}

export function resetMocks() {
  vi.clearAllMocks();
}
