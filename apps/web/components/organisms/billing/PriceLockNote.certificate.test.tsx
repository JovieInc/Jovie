import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { priceLockViewFixture } from '@/tests/fixtures/billing/price-lock';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PriceLockNote } from './PriceLockNote';

describe('PriceLockNote certificate', () => {
  it('keeps the locked monthly price axe-clean', async () => {
    const { container } = render(
      <PriceLockNote lock={priceLockViewFixture()} />
    );

    expect(screen.getByTestId('price-lock-note')).toHaveTextContent(
      'Your price is locked at $12/mo.'
    );
    await expectNoA11yViolations(container);
  });

  it('shows only the yearly price when that is the locked interval', async () => {
    const { container } = render(
      <PriceLockNote
        interval='year'
        lock={priceLockViewFixture({
          monthlyAmountCents: null,
          stripePriceIdMonthly: null,
          yearlyAmountCents: 12000,
          stripePriceIdYearly: 'price_120',
        })}
      />
    );

    expect(screen.getByTestId('price-lock-note')).toHaveTextContent('$120/yr');
    await expectNoA11yViolations(container);
  });

  it('renders a long amount and a custom class in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl'>
        <PriceLockNote
          className='custom-note'
          lock={priceLockViewFixture({ monthlyAmountCents: 1234567 })}
        />
      </div>
    );

    const note = screen.getByTestId('price-lock-note');
    expect(note).toHaveTextContent('$12,345.67/mo');
    expect(note).toHaveClass('custom-note');
    await expectNoA11yViolations(container);
  });

  it('renders nothing and nothing to audit without a lock', async () => {
    const { container } = render(<PriceLockNote lock={null} />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
