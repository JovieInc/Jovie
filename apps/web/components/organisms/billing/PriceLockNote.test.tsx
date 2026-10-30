import { lintCopy } from '@jovie/copy';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import { PriceLockNote } from './PriceLockNote';

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

describe('PriceLockNote', () => {
  it('discloses the locked price, and the rendered copy passes the copy lint', () => {
    render(<PriceLockNote lock={view} />);
    const note = screen.getByTestId('price-lock-note');
    expect(note.textContent).toBe(
      'Your price is locked at $12/mo. It stays the same if the list price changes.'
    );
    expect(
      lintCopy(note.textContent ?? '', { register: 'jovie-product-ui' })
        .blocking
    ).toEqual([]);
  });

  it('renders nothing without a lock, so the claim is only ever true', () => {
    const { container } = render(<PriceLockNote lock={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an interval the lock does not cover', () => {
    const { container } = render(<PriceLockNote lock={view} interval='year' />);
    expect(container).toBeEmptyDOMElement();
  });
});
