import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

vi.mock('@/hooks/use-billing-status', () => ({
  useBillingStatus: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

import { useClerk, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { UserButton } from '@/components/molecules/UserButton';
import { useBillingStatus } from '@/hooks/use-billing-status';

const mockUseBillingStatus = vi.mocked(useBillingStatus);
const mockUseUser = vi.mocked(useUser);
const mockUseClerk = vi.mocked(useClerk);
const mockUseRouter = vi.mocked(useRouter);

const originalFetch = global.fetch;
const originalLocation = window.location;

describe('UserButton billing actions', () => {
  let fetchMock: Mock;
  let pushMock: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;

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

    mockUseBillingStatus.mockReset();

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  afterAll(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });

  it('offers a direct upgrade checkout when the user is not on Pro', async () => {
    const checkoutUrl = 'https://checkout.stripe.com/session/test';

    mockUseBillingStatus.mockReturnValue({
      isPro: false,
      plan: null,
      hasStripeCustomer: false,
      loading: false,
      error: null,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        pricingOptions: [
          { interval: 'year', priceId: 'price_year' },
          { interval: 'month', priceId: 'price_month' },
        ],
      }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: checkoutUrl }),
    });

    render(<UserButton showUserInfo />);

    fireEvent.click(screen.getByText('Adele Adkins'));

    const upgradeItem = await screen.findByText('Upgrade to Pro');
    fireEvent.click(upgradeItem);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        '/api/stripe/pricing-options'
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/stripe/checkout',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId: 'price_month' }),
        })
      );
      expect(window.location.href).toBe(checkoutUrl);
    });
  });

  it('opens the Stripe billing portal for Pro users', async () => {
    const portalUrl = 'https://billing.stripe.com/session/test';

    mockUseBillingStatus.mockReturnValue({
      isPro: true,
      plan: 'pro',
      hasStripeCustomer: true,
      loading: false,
      error: null,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: portalUrl }),
    });

    render(<UserButton showUserInfo />);

    fireEvent.click(screen.getByText('Adele Adkins'));

    const manageBilling = await screen.findByText('Manage Billing');
    fireEvent.click(manageBilling);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(window.location.href).toBe(portalUrl);
    });
  });
});
