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
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: vi.fn(),
  useClerk: vi.fn(),
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

import { useClerk, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { UserButton } from '@/components/organisms/user-button';
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
const mockUseUser = vi.mocked(useUser);
const mockUseClerk = vi.mocked(useClerk);
const mockUseRouter = vi.mocked(useRouter);

const originalLocation = window.location;

describe('UserButton billing actions', () => {
  let fetchMock: Mock;
  let pushMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);

    // Mock TanStack Query hooks
    mockUsePricingOptionsQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({
        data: {
          pricingOptions: [
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

    mockUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        imageUrl: null,
        fullName: 'Adele Adkins',
        firstName: 'Adele',
        emailAddresses: [{ emailAddress: 'adele@example.com' }],
        primaryEmailAddress: { emailAddress: 'adele@example.com' },
      } as any,
    });

    mockUseClerk.mockReturnValue({
      signOut: vi.fn(),
      openUserProfile: vi.fn(),
    } as any);

    pushMock = vi.fn();
    mockUseRouter.mockReturnValue({
      push: pushMock,
    } as any);

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
    const upgradeButton = await screen.findByText('Upgrade to Pro');
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
});
