import { render, screen, within } from '@testing-library/react';
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

afterAll(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    configurable: true,
    writable: true,
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

  it.each([true, false])(
    'holds the placeholder (showUserInfo %s) until the session loads',
    async showUserInfo => {
      mockUseUserSafe.mockReturnValue({
        isLoaded: false,
        isSignedIn: false,
        user: null,
      } as any);
      const { container } = render(<UserButton showUserInfo={showUserInfo} />);

      expect(screen.getByTestId('user-button-loading')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

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
    // The fill itself is asserted in UserButtonLoading.test.tsx.
    expect(within(menu).getByTestId('billing-loading')).toBeInTheDocument();
    expect(menu.querySelector('.bg-on-media\\/10')).toBeNull();
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

// The menu's custom rows sit on the shared inset-panel geometry: one gutter,
// one icon column, one label edge.
describe('UserButton account surface layout', () => {
  const FREE_BILLING = {
    data: { isPro: false, plan: null, hasStripeCustomer: false },
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    mockSignedInAccount();
    mockUseBillingStatusQuery.mockReturnValue(FREE_BILLING as any);
  });

  async function openMenu(calm = false) {
    const user = userEvent.setup();
    const view = render(<UserButton showUserInfo calm={calm} />);
    const trigger = screen.getByRole('button', { name: /Adele Adkins/i });
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    return { ...view, menu, trigger, user };
  }

  it('keeps every menu entry reachable by role and name', async () => {
    const { menu } = await openMenu();
    for (const name of [
      'Open profile for Adele Adkins',
      'Help',
      /^Settings/,
      /^Send Feedback/,
    ]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      within(menu).getByRole('button', { name: /Usage remaining/ })
    ).toBeInTheDocument();
    expect(within(menu).getAllByRole('separator').length).toBeGreaterThan(2);
  });

  it('aligns the custom rows to the shared gutter and icon column', async () => {
    const { menu, trigger } = await openMenu(true);

    // Header: no extra row inset; the avatar sits in the icon column and the
    // name starts on the label edge shared with every other row.
    const profile = within(menu).getByRole('menuitem', {
      name: 'Open profile for Adele Adkins',
    });
    expect(profile).toHaveClass('gap-2', 'px-(--space-2-5)');
    const avatarColumn = profile.firstElementChild as HTMLElement;
    expect(avatarColumn).toHaveClass('w-4', 'shrink-0', 'justify-center');

    // Help uses the normal action row, leaving the header for identity.
    const help = within(menu).getByRole('menuitem', { name: 'Help' });
    expect(help).toHaveClass('px-2.5');
    expect(help).not.toHaveClass('px-2');

    // Header and footer dividers are hairlines that stop at the gutter.
    const separators = within(menu).getAllByRole('separator');
    for (const separator of separators) {
      expect(separator).toHaveClass('mx-(--space-2-5)', 'h-px', 'bg-subtle');
      expect(separator).not.toHaveClass('h-2');
    }

    // Version reads as a muted section label on the same gutter.
    expect(within(menu).getByTestId('app-build-diagnostics')).toHaveClass(
      'h-8',
      'px-(--space-2-5)',
      'text-tertiary-token'
    );

    // Usage is a normal row: concentric radius, not a square strip.
    const usage = within(menu).getByRole('button', { name: /Usage remaining/ });
    expect(usage).not.toHaveClass('rounded-none');
    expect(usage).toHaveClass('h-8', 'px-(--space-2-5)');

    // Sidebar account row: avatar centred on the nav icon column.
    expect(trigger).toHaveClass('px-0', 'gap-2');
    expect(trigger.querySelector('[data-user-button-icon-column]')).toHaveClass(
      'w-4',
      'justify-center'
    );
  });

  it('keeps arrow-key navigation and Escape focus return', async () => {
    const user = userEvent.setup();
    render(<UserButton showUserInfo />);
    const trigger = screen.getByRole('button', { name: /Adele Adkins/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    await user.keyboard('{ArrowDown}');
    expect(items).toContain(document.activeElement);
    const first = document.activeElement;
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).not.toBe(first);
    expect(items).toContain(document.activeElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
