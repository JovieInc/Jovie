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

// Polish guard (founder review, 2026-11-14): the account menu reads as one
// column. Every row shares one row geometry and one icon column, no two rows
// reuse an icon, and every shortcut hint is the same keycap component.
describe('UserButton account menu polish guard', () => {
  const PRO_BILLING = {
    data: { isPro: true, plan: 'pro', hasStripeCustomer: true },
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    mockSignedInAccount();
    mockUseBillingStatusQuery.mockReturnValue(PRO_BILLING as any);
  });

  async function openMenu() {
    const user = userEvent.setup();
    render(<UserButton showUserInfo />);
    const trigger = screen.getByRole('button', { name: /Adele Adkins/i });
    await user.click(trigger);
    const menu = await screen.findByRole('menu');
    return { menu, trigger, user };
  }

  /** Every icon + label row of the root menu, top to bottom. */
  function menuRows(menu: HTMLElement): HTMLElement[] {
    const item = (name: RegExp) => within(menu).getByRole('menuitem', { name });
    return [
      item(/^Settings/),
      within(menu).getByRole('button', { name: /^Usage remaining/i }),
      item(/^Download Desktop App$/),
      item(/^Manage billing$/i),
      item(/^(Hide|Show) (Earnings|money)/i),
      item(/^Help$/),
      item(/^Learn More$/),
      item(/^Send Feedback$/),
      item(/^Sign out/i),
    ];
  }

  function leadingIcon(row: HTMLElement): SVGElement {
    const icon = row.querySelector('svg');
    if (!icon) throw new Error(`Row "${row.textContent}" has no icon`);
    return icon;
  }

  it('gives every row the same height, gutter, gap and icon column', async () => {
    const { menu } = await openMenu();
    const rows = menuRows(menu);
    expect(rows).toHaveLength(9);

    for (const row of rows) {
      expect(row, row.textContent ?? '').toHaveClass(
        'h-8',
        'gap-2',
        'px-(--space-2-5)'
      );
      const icon = leadingIcon(row);
      expect(icon, row.textContent ?? '').toHaveClass('h-4', 'w-4');
      const column = icon.parentElement as HTMLElement;
      expect(column, row.textContent ?? '').toHaveClass(
        'h-4',
        'w-4',
        'shrink-0',
        'items-center',
        'justify-center'
      );
      // The icon column is the first thing in the row, so every label starts
      // on the same edge.
      expect(row.querySelector('span')?.contains(icon)).toBe(true);
    }

    // The usage row is a design-system Button, which wraps its children in an
    // inline content span. That wrapper must not become the flex item, or the
    // icon leaves the column and the value crowds the label.
    const usage = rows[1];
    expect(usage).toHaveClass('[&>span]:contents');
    const value = within(usage).getByTestId('usage-menu-value');
    expect(value).toHaveClass('ms-auto', 'tabular-nums', 'text-tertiary-token');
    // It discloses details, so it keeps a chevron after the value.
    expect(value.querySelector('svg')).not.toBeNull();
  });

  it('never gives two rows the same icon', async () => {
    const { menu } = await openMenu();
    const icons = menuRows(menu).map(row => {
      const name = [...leadingIcon(row).classList].find(
        cls => cls.startsWith('lucide-') && cls !== 'lucide-icon'
      );
      expect(name, row.textContent ?? '').toBeTruthy();
      return name;
    });
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('renders every shortcut hint as the same muted, right-aligned keycaps', async () => {
    const { menu } = await openMenu();
    const settings = within(menu).getByRole('menuitem', { name: /^Settings/ });
    const signOut = within(menu).getByRole('menuitem', { name: /^Sign out/i });

    const hints = [settings, signOut].map(row => {
      const hint = row.querySelector<HTMLElement>(
        '[data-account-menu-shortcut]'
      );
      expect(hint, row.textContent ?? '').not.toBeNull();
      return hint as HTMLElement;
    });

    // One component: same wrapper classes, and every key is a design-system
    // Kbd keycap with the same classes.
    expect(hints[0].className).toBe(hints[1].className);
    const keycaps = hints.map(hint => [...hint.children] as HTMLElement[]);
    const keycapClasses = new Set<string>();
    for (const caps of keycaps) {
      for (const cap of caps) {
        expect(cap.tagName).toBe('KBD');
        expect(cap).toHaveAttribute('data-slot', 'kbd');
        keycapClasses.add(cap.className);
      }
    }
    expect(keycapClasses.size).toBe(1);
    expect(keycaps[0].map(cap => cap.textContent)).toEqual(['G', 'S']);
    expect(keycaps[1]).toHaveLength(3);

    // Muted and right-aligned in the row's trailing slot.
    for (const hint of hints) {
      expect(hint.parentElement).toHaveClass('ms-auto', 'text-tertiary-token');
    }
    // No hint falls back to a bare text <kbd>.
    expect(menu.querySelector('kbd:not([data-slot="kbd"])')).toBeNull();
  });

  it('uses Title Case for every row label', async () => {
    const { menu } = await openMenu();
    for (const name of [/^Manage Billing$/, /^Hide Earnings/, /^Sign Out/]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      within(menu).getByRole('button', { name: /^Usage Remaining/ })
    ).toBeInTheDocument();
  });

  it('keeps the header a tight block: name with the plan badge beside it, email under it', async () => {
    const { menu } = await openMenu();
    const profile = within(menu).getByRole('menuitem', {
      name: 'Open profile for Adele Adkins',
    });
    const name = within(profile).getByTitle('Adele Adkins');
    const badge = within(profile).getByText('Pro');
    // Badge sits next to the name on one centred line, not pushed to the far
    // edge by a stretched name.
    expect(name.parentElement).toBe(badge.parentElement);
    expect(name.parentElement).toHaveClass('items-center');
    expect(name).not.toHaveClass('flex-1');
    // No username: the email fills the second line instead of a blank spacer.
    expect(within(profile).getByText('adele@example.com')).toHaveClass(
      'truncate',
      'text-tertiary-token'
    );
    expect(profile.textContent).not.toContain(' ');
  });

  it('drops the second header line entirely when there is no handle or email', async () => {
    mockUseUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_321',
        imageUrl: null,
        fullName: 'Adele Adkins',
        firstName: 'Adele',
        emailAddresses: [],
        primaryEmailAddress: null,
      },
    } as any);
    const { menu } = await openMenu();
    const profile = within(menu).getByRole('menuitem', {
      name: 'Open profile for Adele Adkins',
    });
    expect(profile.querySelector('p')).toBeNull();
    expect(profile.textContent).not.toContain(' ');
  });

  it('shows earnings visibility as a labelled switch wired to the money cookie', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { href: '', reload },
      writable: true,
      configurable: true,
    });
    const cookieWrite = vi.spyOn(document, 'cookie', 'set');
    try {
      const { menu, user } = await openMenu();
      const row = within(menu).getByRole('menuitem', {
        name: /^Hide Earnings/,
      });
      // The label does not flip; the switch carries the state.
      expect(row).toHaveTextContent('Hide Earnings');
      const toggle = row.querySelector('[role="switch"]');
      expect(toggle).toHaveAttribute('aria-checked', 'false');
      expect(toggle).toHaveAttribute('data-state', 'unchecked');

      await user.click(row);
      expect(cookieWrite).toHaveBeenCalledWith(
        expect.stringContaining('jovie_money_hidden=')
      );
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      cookieWrite.mockRestore();
    }
  });

  it('shows the earnings switch on when earnings are already hidden', async () => {
    const cookieRead = vi
      .spyOn(document, 'cookie', 'get')
      .mockReturnValue('jovie_money_hidden=1');
    try {
      const { menu } = await openMenu();
      const row = within(menu).getByRole('menuitem', {
        name: /^Hide Earnings/,
      });
      expect(row.querySelector('[role="switch"]')).toHaveAttribute(
        'aria-checked',
        'true'
      );
    } finally {
      cookieRead.mockRestore();
    }
  });

  it('opens the footer menu upward and points the trigger chevron the same way', async () => {
    const user = userEvent.setup();
    render(<UserButton showUserInfo />);
    const trigger = screen.getByRole('button', { name: /Adele Adkins/i });
    const chevron = trigger.querySelector('[data-user-button-chevron]');
    expect(chevron).toHaveAttribute('data-state', 'closed');
    expect(chevron).not.toHaveClass('-rotate-90');

    await user.click(trigger);
    // The footer row's menu opens upward, and the chevron points the same way.
    expect(await screen.findByRole('menu')).toHaveAttribute('data-side', 'top');
    expect(chevron).toHaveAttribute('data-state', 'open');
    expect(chevron).toHaveClass('-rotate-90', 'opacity-100');
    expect(chevron).not.toHaveClass('rotate-90');
  });
});
