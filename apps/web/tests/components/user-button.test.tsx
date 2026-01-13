import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

vi.mock('@/hooks/useBillingStatus', () => ({
  useBillingStatus: vi.fn(),
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
import { useBillingStatus } from '@/hooks/useBillingStatus';
import { track } from '@/lib/analytics';

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mockUseBillingStatus = vi.mocked(useBillingStatus);
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
    await flushMicrotasks();

    fireEvent.click(await screen.findByText('Upgrade to Pro'));

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/stripe/pricing-options');
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
    await flushMicrotasks();

    fireEvent.click(await screen.findByText('Manage billing'));

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
