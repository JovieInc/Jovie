import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/queries', () => ({
  useBillingStatusQuery: vi.fn(),
  usePricingOptionsQuery: vi.fn(),
  useCheckoutMutation: vi.fn(),
  usePortalMutation: vi.fn(),
  useFeedbackMutation: vi.fn(),
  useChatUsageQuery: vi.fn(),
  useUsageSummaryQuery: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(() => '/app'),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(),
  useClerk: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useUserSafe: vi.fn(),
  useAuthSafe: vi.fn(),
}));

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/lib/analytics', () => ({
  __esModule: true,
  track: vi.fn(),
}));

vi.mock('@/components/organisms/desktop-update/DesktopUpdateProvider', () => ({
  useDesktopUpdateContext: vi.fn(),
}));

vi.mock('@/components/organisms/user-button/OviePrivacyLockControl', () => ({
  OviePrivacyLockControl: ({
    ensurePrivacyLockCanBeEnabled,
  }: {
    ensurePrivacyLockCanBeEnabled: () => Promise<void>;
  }) => (
    <div
      data-testid='ovie-privacy-control'
      data-readiness-check={String(Boolean(ensurePrivacyLockCanBeEnabled))}
    />
  ),
}));
vi.mock('@/lib/workspace-lock/unlock-with-passkey', () => ({
  ensurePrivacyLockCanBeEnabled: vi.fn(async () => {}),
}));

import { usePathname, useRouter } from 'next/navigation';
import { useDesktopUpdateContext } from '@/components/organisms/desktop-update/DesktopUpdateProvider';
import { UserButton } from '@/components/organisms/user-button/UserButton';
import { useAuthSafe, useUserSafe } from '@/hooks/useClerkSafe';
import {
  useBillingStatusQuery,
  useChatUsageQuery,
  useCheckoutMutation,
  useFeedbackMutation,
  usePortalMutation,
  usePricingOptionsQuery,
  useUsageSummaryQuery,
} from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const mockUseBillingStatusQuery = vi.mocked(useBillingStatusQuery);
const mockUseChatUsageQuery = vi.mocked(useChatUsageQuery);
const mockUseUsageSummaryQuery = vi.mocked(useUsageSummaryQuery);
const mockUsePricingOptionsQuery = vi.mocked(usePricingOptionsQuery);
const mockUseCheckoutMutation = vi.mocked(useCheckoutMutation);
const mockUsePortalMutation = vi.mocked(usePortalMutation);
const mockUseFeedbackMutation = vi.mocked(useFeedbackMutation);
const mockUseUserSafe = vi.mocked(useUserSafe);
const mockUseAuthSafe = vi.mocked(useAuthSafe);
const mockUseRouter = vi.mocked(useRouter);
const mockUsePathname = vi.mocked(usePathname);
const mockUseDesktopUpdateContext = vi.mocked(useDesktopUpdateContext);

const originalLocation = window.location;

describe('UserButton browser chunk diet (JOV-12023)', () => {
  // #24725 named these the last eager desktop edges; UserButton must never
  // reintroduce them. A static titlebar import drags electron-bridge, the
  // update modal and radix dialog into every browser shell chunk.
  const source = readFileSync(path.join(__dirname, 'UserButton.tsx'), 'utf8');
  const lazySource = readFileSync(
    path.join(__dirname, 'desktop-release-identity.lazy.ts'),
    'utf8'
  );

  it('keeps every desktop module out of the static import graph', () => {
    expect(source).not.toMatch(
      /from '@\/components\/organisms\/DesktopTitlebar'/
    );
    expect(source).not.toMatch(/from '@\/lib\/desktop\/electron-bridge'/);
    expect(source).not.toMatch(
      /from '@\/lib\/workspace-lock\/unlock-with-passkey'/
    );
    expect(source).toMatch(/from '@\/lib\/desktop\/electron-runtime'/);
    expect(source).toMatch(/from '\.\/desktop-release-identity\.lazy'/);
    expect(lazySource).toMatch(
      /import\('@\/components\/organisms\/DesktopTitlebar'/
    );
    expect(lazySource).toMatch(/ssr: false/);
  });
});

/** Signed-in account with free billing defaults; each test sets billing. */
function mockSignedInAccount(): void {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  delete document.documentElement.dataset.desktopRuntime;

  const fetchMock = vi.fn();
  vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

  // Mock TanStack Query hooks
  mockUsePricingOptionsQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn().mockResolvedValue({
      data: {
        options: [
          { interval: 'year', priceId: 'price_year' },
          { interval: 'month', priceId: 'price_month' },
        ],
      },
    }),
  } as any);

  mockUseCheckoutMutation.mockReturnValue({
    mutateAsync: vi.fn().mockImplementation(async ({ priceId }) => {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      return response.json();
    }),
    isPending: false,
    isError: false,
  } as any);

  mockUsePortalMutation.mockReturnValue({
    mutateAsync: vi.fn().mockImplementation(async () => {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.json();
    }),
    isPending: false,
    isError: false,
  } as any);

  mockUseFeedbackMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ ok: true, id: 'feedback_test' }),
    isPending: false,
    isError: false,
  } as any);

  mockUseChatUsageQuery.mockReturnValue({
    data: {
      plan: 'free',
      weeklyLimit: 15,
      used: 4,
      remaining: 11,
      resetAt: '2026-05-23T07:00:00.000Z',
      isExhausted: false,
      warningThreshold: 3,
      isNearLimit: false,
    },
    isLoading: false,
    error: null,
  } as any);
  mockUseUsageSummaryQuery.mockReturnValue({
    data: {
      plan: 'free',
      planDisplayName: 'Free',
      suggestions: {
        used: 3,
        limit: 15,
        remaining: 12,
        remainingPercent: 80,
        resetAt: '2026-05-25T00:00:00.000Z',
      },
      liveActions: {
        used: 1,
        limit: 5,
        remaining: 4,
        resetAt: '2026-05-23T20:00:00.000Z',
      },
      remainingPercent: 80,
    },
    isLoading: false,
    error: null,
  } as any);

  mockUseUserSafe.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user_123',
      imageUrl: null,
      fullName: 'Adele Adkins',
      firstName: 'Adele',
      emailAddresses: [{ emailAddress: 'adele@example.com' }],
      primaryEmailAddress: { emailAddress: 'adele@example.com' },
    } as any,
  });

  mockUseAuthSafe.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'user_123',
    sessionId: 'sess_123',
    sessionClaims: null,
    actor: null,
    orgId: null,
    orgRole: null,
    orgSlug: null,
    has: vi.fn(() => false),
    getToken: vi.fn(async () => null),
    signOut: vi.fn(),
  } as any);

  const pushMock = vi.fn();
  mockUseRouter.mockReturnValue({
    push: pushMock,
  } as any);
  mockUsePathname.mockReturnValue('/app');
  mockUseDesktopUpdateContext.mockReturnValue(null);

  mockUseBillingStatusQuery.mockReset();

  Object.defineProperty(window, 'location', {
    value: { href: '' },
    writable: true,
    configurable: true,
  });
}

describe('UserButton cookie settings access', () => {
  beforeEach(() => {
    mockSignedInAccount();
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it.each([
    ['', true],
    ['jv_cc_required=0=1', true],
    ['jv_cc_required=0; jv_cc_required=1', true],
    ['jv_cc_required=0', false],
  ])(
    'keeps cookie settings reachable for region flag %j',
    async (cookie, visible) => {
      const cookieRead = vi
        .spyOn(document, 'cookie', 'get')
        .mockReturnValue(cookie);
      mockUseBillingStatusQuery.mockReturnValue({
        data: { isPro: false, plan: null, hasStripeCustomer: false },
        isLoading: false,
        error: null,
      } as any);
      try {
        const user = userEvent.setup();
        render(<UserButton showUserInfo />);
        await user.click(screen.getByRole('button', { name: /Adele Adkins/i }));
        await user.hover(screen.getByRole('menuitem', { name: 'Learn More' }));
        await screen.findByRole('menuitem', { name: 'Cookie Policy' });
        expect(
          screen.queryByRole('menuitem', { name: 'Cookie Settings' }) !== null
        ).toBe(visible);
      } finally {
        cookieRead.mockRestore();
      }
    }
  );
});

// State and accessibility coverage for the trigger states. axe runs on each
// trigger; the open menu is not axe-clean yet because UsageMenuItem nests its
// disclosure button directly in role=menu (aria-required-children), so the
// open-menu test asserts behaviour only.
describe('UserButton states', () => {
  const FREE_BILLING = {
    data: { isPro: false, plan: null, hasStripeCustomer: false },
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    mockSignedInAccount();
    mockUseBillingStatusQuery.mockReturnValue(FREE_BILLING as any);
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it.each([
    [true, 'rounded-md'],
    [false, 'rounded-full'],
  ])(
    'holds the skeleton (showUserInfo %s) until the session loads',
    async (showUserInfo, shape) => {
      mockUseUserSafe.mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
        user: null,
      } as any);
      const { container } = render(<UserButton showUserInfo={showUserInfo} />);

      expect(screen.getByTestId('user-button-loading')).toHaveClass(shape);
      expect(screen.queryByRole('button')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('draws the loading row with the theme-safe interactive-hover token', () => {
    mockUseUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    } as any);
    render(<UserButton showUserInfo />);

    const loading = screen.getByTestId('user-button-loading');
    const indicators = [...loading.querySelectorAll('.animate-pulse')];
    // Avatar disc and name line.
    expect(indicators).toHaveLength(2);
    for (const indicator of indicators) {
      // Same 168 176 195 / 6% as before in dark; 6% ink on the light rail.
      expect(indicator).toHaveClass('bg-interactive-hover');
      // bg-sidebar-accent is ~1.04:1 on the light rail: invisible (JOV-12383).
      expect(indicator).not.toHaveClass('bg-sidebar-accent');
    }
  });

  it('opens the menu from the keyboard, shows the billing skeleton while billing loads, and Escape returns focus', async () => {
    mockUseBillingStatusQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);
    const user = userEvent.setup();
    const { container } = render(<UserButton showUserInfo />);

    const trigger = screen.getByRole('button', { name: /Adele Adkins/i });
    expect(trigger).toHaveAttribute('type', 'button');
    // The PlainButton trigger keeps its own sidebar focus ring, not the default one.
    expect(trigger).toHaveClass('focus-visible:ring-sidebar-ring');
    expect(trigger).not.toHaveClass('focus-visible:ring-focus');
    await expectNoA11yViolations(container);

    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    expect(menu.querySelectorAll('.bg-on-media\\/10')).toHaveLength(2);
    expect(
      screen.queryByRole('menuitem', { name: /Upgrade/i })
    ).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('names the compact avatar trigger and opens the same menu', async () => {
    const user = userEvent.setup();
    const { container } = render(<UserButton />);

    const trigger = screen.getByRole('button', { name: /Open user menu/ });
    await expectNoA11yViolations(container);
    await user.click(trigger);
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: /Sign out/i })
    ).toBeInTheDocument();
  });

  it('falls back to the Account label and initials when the user has no name', async () => {
    mockUseUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_456',
        imageUrl: null,
        fullName: null,
        firstName: null,
        emailAddresses: [{ emailAddress: 'no-name@example.com' }],
        primaryEmailAddress: { emailAddress: 'no-name@example.com' },
      },
    } as any);
    const { container } = render(<UserButton showUserInfo />);

    expect(screen.getByRole('button', { name: /Account/ })).toBeInTheDocument();
    expect(screen.queryByText(/no-name/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('truncates a long account name in a right-to-left page and keeps it in the title', async () => {
    const longName = 'Adele Laurie Blue Adkins Of The Royal Albert Hall';
    mockUseUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_789',
        imageUrl: null,
        fullName: longName,
        firstName: 'Adele',
        emailAddresses: [{ emailAddress: 'adele@example.com' }],
        primaryEmailAddress: { emailAddress: 'adele@example.com' },
      },
    } as any);
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <UserButton showUserInfo />
      </div>
    );

    const name = screen.getByTitle(longName);
    expect(name).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
