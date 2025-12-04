import '../app/globals.css';
import { neonConfig, Pool } from '@neondatabase/serverless';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import React from 'react';
import { afterEach, beforeAll, expect, vi } from 'vitest';
import ws from 'ws';
import * as schema from '@/lib/db/schema';

// Configure WebSocket for transaction support in tests
neonConfig.webSocketConstructor = ws;

// Setup test database
if (process.env.NODE_ENV === 'test') {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn('DATABASE_URL is not set. Database tests will be skipped.');
  } else {
    const pool = new Pool({ connectionString: databaseUrl });
    const db = drizzle(pool, { schema });

    beforeAll(async () => {
      try {
        await migrate(db, { migrationsFolder: './drizzle/migrations' });
      } catch (error) {
        console.error('Failed to run migrations:', error);
        throw error;
      }
    });

    // Make db available globally for tests
    globalThis.db = db;
  }
}

expect.extend(matchers);

// Ensure the DOM is cleaned up between tests to avoid cross-test interference
afterEach(() => {
  cleanup();
});

// Mock Clerk components and hooks
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

// Mock feature flags
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

// Mock server-only modules
vi.mock('server-only', () => ({
  default: vi.fn(),
}));

// Mock Next.js app router helpers to avoid needing actual routing context
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock FeaturedArtists component to handle async component
vi.mock('@/components/home/FeaturedArtists', () => ({
  FeaturedArtists: () =>
    React.createElement(
      'section',
      { className: 'w-full py-12', 'data-testid': 'featured-artists' },
      React.createElement(
        'div',
        { className: 'w-full md:hidden overflow-x-auto scroll-smooth' },
        React.createElement(
          'div',
          {
            className:
              'flex flex-row gap-6 justify-center md:justify-between w-full min-w-[600px]',
          },
          // Mock artist links
          React.createElement(
            'a',
            {
              href: '/ladygaga',
              className: 'group flex items-center justify-center',
              title: 'Lady Gaga',
            },
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'div',
                {
                  'data-testid': 'optimized-image',
                  className:
                    'ring-2 ring-gray-300 dark:ring-white/20 group-hover:ring-gray-400 dark:group-hover:ring-white/40 transition-all duration-200',
                },
                React.createElement('div', {
                  'data-testid': 'artist-image',
                  className: 'mock-image',
                })
              ),
              React.createElement(
                'div',
                {
                  className:
                    'absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                },
                React.createElement(
                  'span',
                  {
                    className:
                      'text-white text-xs font-medium text-center px-2',
                  },
                  'Lady Gaga'
                )
              )
            )
          ),
          React.createElement(
            'a',
            {
              href: '/davidguetta',
              className: 'group flex items-center justify-center',
              title: 'David Guetta',
            },
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'div',
                {
                  'data-testid': 'optimized-image',
                  className:
                    'ring-2 ring-gray-300 dark:ring-white/20 group-hover:ring-gray-400 dark:group-hover:ring-white/40 transition-all duration-200',
                },
                React.createElement('div', {
                  'data-testid': 'artist-image',
                  className: 'mock-image',
                })
              ),
              React.createElement(
                'div',
                {
                  className:
                    'absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                },
                React.createElement(
                  'span',
                  {
                    className:
                      'text-white text-xs font-medium text-center px-2',
                  },
                  'David Guetta'
                )
              )
            )
          ),
          React.createElement(
            'a',
            {
              href: '/billieeilish',
              className: 'group flex items-center justify-center',
              title: 'Billie Eilish',
            },
            React.createElement(
              'div',
              { className: 'relative' },
              React.createElement(
                'div',
                {
                  'data-testid': 'optimized-image',
                  className:
                    'ring-2 ring-gray-300 dark:ring-white/20 group-hover:ring-gray-400 dark:group-hover:ring-white/40 transition-all duration-200',
                },
                React.createElement('div', {
                  'data-testid': 'placeholder-image',
                  className: 'placeholder',
                })
              ),
              React.createElement(
                'div',
                {
                  className:
                    'absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300',
                },
                React.createElement(
                  'span',
                  {
                    className:
                      'text-white text-xs font-medium text-center px-2',
                  },
                  'Billie Eilish'
                )
              )
            )
          )
        )
      )
    ),
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};

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

// Note: OptimizedImage and PlaceholderImage are no longer globally mocked here.
// Individual tests can mock them as needed, while unit tests for these atoms
// exercise the real implementations.

// Mock @headlessui/react properly with all components
const MockedComponents = {
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
  DialogDescription: React.forwardRef<
    HTMLParagraphElement,
    React.ComponentProps<'p'>
  >((props, ref) => {
    return React.createElement('p', { ...props, ref });
  }),
  DialogBackdrop: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),

  // Combobox components
  Combobox: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  ComboboxInput: React.forwardRef<
    HTMLInputElement,
    React.ComponentProps<'input'>
  >((props, ref) => {
    return React.createElement('input', { ...props, ref, role: 'textbox' });
  }),
  ComboboxButton: React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'>
  >((props, ref) => {
    return React.createElement('button', { ...props, ref });
  }),
  ComboboxOptions: React.forwardRef<
    HTMLUListElement,
    React.ComponentProps<'ul'>
  >((props, ref) => {
    return React.createElement('ul', { ...props, ref, role: 'listbox' });
  }),
  ComboboxOption: React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
    (props, ref) => {
      return React.createElement('li', { ...props, ref, role: 'option' });
    }
  ),

  // Listbox components
  Listbox: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  ListboxButton: React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'>
  >((props, ref) => {
    return React.createElement('button', { ...props, ref });
  }),
  ListboxOptions: React.forwardRef<
    HTMLUListElement,
    React.ComponentProps<'ul'>
  >((props, ref) => {
    return React.createElement('ul', { ...props, ref, role: 'listbox' });
  }),
  ListboxOption: React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
    (props, ref) => {
      return React.createElement('li', { ...props, ref, role: 'option' });
    }
  ),

  // Menu components
  Menu: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  MenuButton: React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'>
  >((props, ref) => {
    return React.createElement('button', { ...props, ref });
  }),
  MenuItems: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'menu' });
    }
  ),
  MenuItem: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'menuitem' });
    }
  ),

  // Popover components
  Popover: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  PopoverButton: React.forwardRef<
    HTMLButtonElement,
    React.ComponentProps<'button'>
  >((props, ref) => {
    return React.createElement('button', { ...props, ref });
  }),
  PopoverPanel: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),

  // RadioGroup components
  RadioGroup: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'radiogroup' });
    }
  ),
  RadioGroupOption: React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
  >((props, ref) => {
    return React.createElement('div', { ...props, ref, role: 'radio' });
  }),

  // Switch components
  Switch: React.forwardRef<HTMLButtonElement, React.ComponentProps<'button'>>(
    (props, ref) => {
      return React.createElement('button', { ...props, ref, role: 'switch' });
    }
  ),

  // Tab components
  Tab: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'tab' });
    }
  ),
  TabGroup: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'tablist' });
    }
  ),
  TabList: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  TabPanels: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  TabPanel: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref, role: 'tabpanel' });
    }
  ),

  // Transition components
  Transition: React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
    (props, ref) => {
      return React.createElement('div', { ...props, ref });
    }
  ),
  TransitionChild: React.forwardRef<
    HTMLDivElement,
    React.ComponentProps<'div'>
  >((props, ref) => {
    return React.createElement('div', { ...props, ref });
  }),

  // Description component
  Description: React.forwardRef<
    HTMLParagraphElement,
    React.ComponentProps<'p'>
  >((props, ref) => {
    return React.createElement('p', { ...props, ref });
  }),

  // Input component
  Input: React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    (props, ref) => {
      return React.createElement('input', { ...props, ref });
    }
  ),

  // Textarea component
  Textarea: React.forwardRef<
    HTMLTextAreaElement,
    React.ComponentProps<'textarea'>
  >((props, ref) => {
    return React.createElement('textarea', { ...props, ref });
  }),
};

// Add display names to all mocked components
MockedComponents.Dialog.displayName = 'MockedDialog';
MockedComponents.DialogPanel.displayName = 'MockedDialogPanel';
MockedComponents.DialogTitle.displayName = 'MockedDialogTitle';
MockedComponents.DialogDescription.displayName = 'MockedDialogDescription';
MockedComponents.DialogBackdrop.displayName = 'MockedDialogBackdrop';

MockedComponents.Input.displayName = 'MockedInput';

MockedComponents.Combobox.displayName = 'MockedCombobox';
MockedComponents.ComboboxInput.displayName = 'MockedComboboxInput';
MockedComponents.ComboboxButton.displayName = 'MockedComboboxButton';
MockedComponents.ComboboxOptions.displayName = 'MockedComboboxOptions';
MockedComponents.ComboboxOption.displayName = 'MockedComboboxOption';

MockedComponents.Listbox.displayName = 'MockedListbox';
MockedComponents.ListboxButton.displayName = 'MockedListboxButton';
MockedComponents.ListboxOptions.displayName = 'MockedListboxOptions';
MockedComponents.ListboxOption.displayName = 'MockedListboxOption';

MockedComponents.Menu.displayName = 'MockedMenu';
MockedComponents.MenuButton.displayName = 'MockedMenuButton';
MockedComponents.MenuItems.displayName = 'MockedMenuItems';
MockedComponents.MenuItem.displayName = 'MockedMenuItem';

MockedComponents.Popover.displayName = 'MockedPopover';
MockedComponents.PopoverButton.displayName = 'MockedPopoverButton';
MockedComponents.PopoverPanel.displayName = 'MockedPopoverPanel';

MockedComponents.RadioGroup.displayName = 'MockedRadioGroup';
MockedComponents.RadioGroupOption.displayName = 'MockedRadioGroupOption';

MockedComponents.Switch.displayName = 'MockedSwitch';

MockedComponents.Tab.displayName = 'MockedTab';
MockedComponents.TabGroup.displayName = 'MockedTabGroup';
MockedComponents.TabList.displayName = 'MockedTabList';
MockedComponents.TabPanels.displayName = 'MockedTabPanels';
MockedComponents.TabPanel.displayName = 'MockedTabPanel';

MockedComponents.Transition.displayName = 'MockedTransition';
MockedComponents.TransitionChild.displayName = 'MockedTransitionChild';

MockedComponents.Description.displayName = 'MockedDescription';

MockedComponents.Input.displayName = 'MockedInput';
MockedComponents.Textarea.displayName = 'MockedTextarea';

vi.mock('@headlessui/react', () => MockedComponents);

// Mock framer-motion to avoid loading the full animation library in tests.
// Components only rely on basic motion primitives, so a div wrapper is enough.
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

// Mock @jovie/ui as a lightweight pass-through to the real module so tests
// can stub specific components when needed without altering default behavior.
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');
  return {
    __esModule: true,
    ...actual,
  };
});
