import { act, render, screen } from '@testing-library/react';
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

import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserButton } from '@/components/organisms/user-button';
import { APP_ROUTES } from '@/constants/routes';
import { useAuthSafe, useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import {
  useBillingStatusQuery,
  useCheckoutMutation,
  usePortalMutation,
  usePricingOptionsQuery,
} from '@/lib/queries';

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mockUseBillingStatusQuery = vi.mocked(useBillingStatusQuery);
const mockUsePricingOptionsQuery = vi.mocked(usePricingOptionsQuery);
const mockUseCheckoutMutation = vi.mocked(useCheckoutMutation);
const mockUsePortalMutation = vi.mocked(usePortalMutation);
const mockUseUserSafe = vi.mocked(useUserSafe);
const mockUseAuthSafe = vi.mocked(useAuthSafe);
const mockUseRouter = vi.mocked(useRouter);
const mockUsePathname = vi.mocked(usePathname);

const originalLocation = window.location;

describe('UserButton billing actions', () => {
  let fetchMock: Mock;
  let pushMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

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

  it('offers a direct upgrade checkout when the user is not on Pro', async () => {
    const checkoutUrl = 'https://checkout.stripe.com/session/test';

    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: false, plan: null, hasStripeCustomer: false },
      isLoading: false,
      error: null,
    } as any);

    // Pricing options are fetched via usePricingOptionsQuery (already mocked in beforeEach)
    // Only checkout goes through fetch
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: checkoutUrl }),
    });

    const user = userEvent.setup();
    render(<UserButton showUserInfo />);

    await user.click(screen.getByText('Adele Adkins'));

    // Wait for dropdown menu to render
    const upgradeButton = await screen.findByText('Get Verified — $39/mo');
    await user.click(upgradeButton);

    await flushMicrotasks();

    // Pricing options are now fetched via usePricingOptionsQuery (mocked)
    // Only the checkout call goes through fetch
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stripe/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_month' }),
      })
    );
    expect(window.location.href).toBe(checkoutUrl);
    expect(track).toHaveBeenCalledWith(
      'billing_upgrade_clicked',
      expect.objectContaining({ surface: 'sidebar_user_menu' })
    );
    expect(track).toHaveBeenCalledWith(
      'billing_upgrade_checkout_redirected',
      expect.objectContaining({ interval: 'month' })
    );
  });

  it('uses a monthly interval alias when starting checkout', async () => {
    const checkoutUrl = 'https://checkout.stripe.com/session/monthly';

    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: false, plan: null, hasStripeCustomer: false },
      isLoading: false,
      error: null,
    } as any);

    mockUsePricingOptionsQuery.mockReturnValue({
      data: {
        options: [
          { interval: 'year', priceId: 'price_year' },
          { interval: 'monthly', priceId: 'price_monthly' },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: checkoutUrl }),
    });

    const user = userEvent.setup();
    render(<UserButton showUserInfo />);

    await user.click(screen.getByText('Adele Adkins'));
    const upgradeButton = await screen.findByText('Get Verified — $39/mo');
    await user.click(upgradeButton);

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stripe/checkout',
      expect.objectContaining({
        body: JSON.stringify({ priceId: 'price_monthly' }),
      })
    );
    expect(window.location.href).toBe(checkoutUrl);
    expect(track).toHaveBeenCalledWith(
      'billing_upgrade_checkout_redirected',
      expect.objectContaining({ interval: 'monthly' })
    );
  });

  it('falls back to the first available pricing option when monthly is unavailable', async () => {
    const checkoutUrl = 'https://checkout.stripe.com/session/fallback';

    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: false, plan: null, hasStripeCustomer: false },
      isLoading: false,
      error: null,
    } as any);

    mockUsePricingOptionsQuery.mockReturnValue({
      data: {
        options: [
          { interval: 'year', priceId: 'price_year' },
          { interval: 'annual', priceId: 'price_annual' },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: checkoutUrl }),
    });

    const user = userEvent.setup();
    render(<UserButton showUserInfo />);

    await user.click(screen.getByText('Adele Adkins'));
    const upgradeButton = await screen.findByText('Get Verified — $39/mo');
    await user.click(upgradeButton);

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/stripe/checkout',
      expect.objectContaining({
        body: JSON.stringify({ priceId: 'price_year' }),
      })
    );
    expect(window.location.href).toBe(checkoutUrl);
    expect(track).toHaveBeenCalledWith(
      'billing_upgrade_checkout_redirected',
      expect.objectContaining({ interval: 'year' })
    );
  });

  it('opens the Stripe billing portal for Pro users', async () => {
    const portalUrl = 'https://billing.stripe.com/session/test';

    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: true, plan: 'pro', hasStripeCustomer: true },
      isLoading: false,
      error: null,
    } as any);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: portalUrl }),
    });

    const user = userEvent.setup();
    render(<UserButton showUserInfo />);

    await user.click(screen.getByText('Adele Adkins'));

    // Wait for dropdown to render
    const manageBillingButton = await screen.findByText('Manage billing');
    await user.click(manageBillingButton);

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(window.location.href).toBe(portalUrl);
    expect(track).toHaveBeenCalledWith(
      'billing_manage_billing_clicked',
      expect.objectContaining({ surface: 'sidebar_user_menu' })
    );
    expect(track).toHaveBeenCalledWith(
      'billing_manage_billing_redirected',
      expect.any(Object)
    );
  });

  it('does not show the passive billing-status toast on admin surfaces', () => {
    mockUsePathname.mockReturnValue('/app/admin');
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);

    render(<UserButton showUserInfo />);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('does not show the passive billing-status toast while the pathname is unavailable', () => {
    mockUsePathname.mockReturnValue(null);
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);

    render(<UserButton showUserInfo />);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the passive billing-status toast on billing surfaces', () => {
    mockUsePathname.mockReturnValue('/billing');
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);

    render(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't confirm your plan. Billing actions may be unavailable.",
      { duration: 6000, id: 'billing-status-error' }
    );
  });

  it('does not repeat the passive billing-status toast after remounting in the same browser session', () => {
    mockUsePathname.mockReturnValue('/app/settings/billing');
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);

    const firstRender = render(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(1);

    firstRender.unmount();
    render(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('does not suppress the passive billing-status toast for a different user in the same browser session', () => {
    mockUsePathname.mockReturnValue('/app/settings/billing');
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);

    const firstRender = render(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(1);

    firstRender.unmount();
    mockUseUserSafe.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_456',
        imageUrl: null,
        fullName: 'Beyonce Knowles',
        firstName: 'Beyonce',
        emailAddresses: [{ emailAddress: 'beyonce@example.com' }],
        primaryEmailAddress: { emailAddress: 'beyonce@example.com' },
      } as any,
    });

    render(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it('waits for the loaded user before showing the passive billing-status toast', () => {
    mockUsePathname.mockReturnValue('/billing');
    mockUseBillingStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Billing unavailable'),
    } as any);
    mockUseUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    } as any);

    const { rerender } = render(<UserButton showUserInfo />);

    expect(toast.error).not.toHaveBeenCalled();
    expect(mockUseBillingStatusQuery).toHaveBeenLastCalledWith({
      enabled: false,
    });

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

    rerender(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(mockUseBillingStatusQuery).toHaveBeenLastCalledWith({
      enabled: true,
    });
    expect(
      window.sessionStorage.getItem('jovie:billing-status-error-toast-shown')
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(
        'jovie:billing-status-error-toast-shown:user_123'
      )
    ).toBe('true');

    rerender(<UserButton showUserInfo />);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('renders a custom trigger while user data is still loading', () => {
    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: false, plan: null, hasStripeCustomer: false },
      isLoading: false,
      error: null,
    } as any);

    mockUseUserSafe.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    } as any);

    render(<UserButton trigger={<div>Jovie Menu</div>} />);

    expect(screen.getByText('Jovie Menu')).toBeInTheDocument();
    expect(document.querySelector('.animate-pulse')).toBeNull();
  });

  it('shows a usage stats entry and routes there from the user menu', async () => {
    mockUseBillingStatusQuery.mockReturnValue({
      data: { isPro: false, plan: null, hasStripeCustomer: false },
      isLoading: false,
      error: null,
    } as any);

    const user = userEvent.setup();
    render(<UserButton showUserInfo />);

    await user.click(screen.getByText('Adele Adkins'));
    await user.click(await screen.findByText('Usage Stats'));

    expect(pushMock).toHaveBeenCalledWith(APP_ROUTES.SETTINGS_USAGE);
  });
});
