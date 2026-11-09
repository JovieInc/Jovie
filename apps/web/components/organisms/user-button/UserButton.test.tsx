import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

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

describe('UserButton browser chunk diet (JOV-12023)', () => {
  // #24725 named these the last eager desktop edges; UserButton must never
  // reintroduce them. A static titlebar import drags electron-bridge, the
  // update modal and radix dialog into every browser shell chunk.
  const source = readFileSync(path.join(__dirname, 'UserButton.tsx'), 'utf8');

  it('never statically imports the desktop titlebar module', () => {
    expect(source).not.toMatch(
      /from '@\/components\/organisms\/DesktopTitlebar'/
    );
    expect(source).toMatch(
      /import\('@\/components\/organisms\/DesktopTitlebar'/
    );
  });

  it('reads the runtime hook from the leaf module, not the bridge', () => {
    expect(source).not.toMatch(/from '@\/lib\/desktop\/electron-bridge'/);
    expect(source).toMatch(/from '@\/lib\/desktop\/electron-runtime'/);
  });
});

describe('UserButton cookie settings access', () => {
  let fetchMock: Mock;
  let pushMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    delete document.documentElement.dataset.desktopRuntime;

    fetchMock = vi.fn();
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

    pushMock = vi.fn();
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
