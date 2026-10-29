import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';

const mocks = vi.hoisted(() => ({
  isSignedIn: false,
  fetchPriceLock: vi.fn(),
}));

vi.mock('@/hooks/useClerkSafe', () => ({
  useAuthSafe: () => ({ isSignedIn: mocks.isSignedIn }),
}));
vi.mock('@/lib/queries/usePriceLockQuery', () => ({
  fetchPriceLock: mocks.fetchPriceLock,
}));

import { LockedPlanPrice } from './LockedPlanPrice';

const view = buildPriceLockView({
  plan: 'pro',
  priceVersionId: 'v',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSignedIn = false;
});

describe('LockedPlanPrice', () => {
  it('shows the list price to a signed-out visitor without calling the API', () => {
    render(<LockedPlanPrice price='$19' cadence='/mo' />);
    expect(screen.getByText('$19')).toBeTruthy();
    expect(mocks.fetchPriceLock).not.toHaveBeenCalled();
  });

  it('shows the locked price and the disclosure to a signed-in person with a lock', async () => {
    mocks.isSignedIn = true;
    mocks.fetchPriceLock.mockResolvedValue(view);
    render(<LockedPlanPrice price='$19' cadence='/mo' />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-plan-price').textContent).toBe('$12/mo')
    );
    expect(screen.getByTestId('price-lock-note').textContent).toContain(
      'locked at $12/mo'
    );
    expect(screen.queryByText('$19')).toBeNull();
  });

  it('keeps the list price when the lock cannot be loaded (checkout still charges the lock)', async () => {
    mocks.isSignedIn = true;
    mocks.fetchPriceLock.mockRejectedValue(new Error('boom'));
    render(<LockedPlanPrice price='$19' cadence='/mo' />);
    await waitFor(() => expect(mocks.fetchPriceLock).toHaveBeenCalled());
    expect(screen.getByText('$19')).toBeTruthy();
  });
});
