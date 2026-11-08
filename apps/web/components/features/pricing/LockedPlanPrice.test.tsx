import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

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
  it('shows the list price to a signed-out visitor without calling the API', async () => {
    const { container } = render(<LockedPlanPrice price='$19' cadence='/mo' />);
    expect(screen.getByText('$19')).toBeTruthy();
    expect(mocks.fetchPriceLock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows the locked price and the disclosure to a signed-in person with a lock', async () => {
    mocks.isSignedIn = true;
    mocks.fetchPriceLock.mockResolvedValue(view);
    const { container } = render(<LockedPlanPrice price='$19' cadence='/mo' />);
    await waitFor(() =>
      expect(screen.getByTestId('locked-plan-price').textContent).toBe('$12/mo')
    );
    expect(screen.getByTestId('price-lock-note').textContent).toContain(
      'locked at $12/mo'
    );
    expect(screen.queryByText('$19')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps the list price when the lock cannot be loaded (checkout still charges the lock)', async () => {
    mocks.isSignedIn = true;
    mocks.fetchPriceLock.mockRejectedValue(new Error('boom'));
    const { container } = render(<LockedPlanPrice price='$19' cadence='/mo' />);
    await waitFor(() => expect(mocks.fetchPriceLock).toHaveBeenCalled());
    expect(screen.getByText('$19')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('keeps the list price when a signed-in person has no lock', async () => {
    mocks.isSignedIn = true;
    mocks.fetchPriceLock.mockResolvedValue(null);
    const { container } = render(<LockedPlanPrice price='$19' cadence='/mo' />);
    await waitFor(() => expect(mocks.fetchPriceLock).toHaveBeenCalled());
    expect(screen.queryByTestId('price-lock-note')).toBeNull();
    expect(screen.getByText('$19')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long price text accessible in an RTL container', async () => {
    const { container } = render(
      <div dir='rtl'>
        <LockedPlanPrice price='$123,456,789.00' cadence='/mo' />
      </div>
    );
    expect(screen.getByText('$123,456,789.00')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
