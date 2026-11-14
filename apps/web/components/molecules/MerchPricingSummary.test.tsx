import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MerchPricingSummary } from './MerchPricingSummary';

describe('MerchPricingSummary', () => {
  it('shows the sale price and profit side by side and is axe-clean', async () => {
    const { container } = render(
      <MerchPricingSummary salePrice='$28.00' profit='$10.40' />
    );

    const summary = screen.getByTestId('merch-pricing-summary');
    expect(summary).toHaveClass('grid-cols-2', 'min-h-15');
    expect(summary).toHaveTextContent('Sale $28.00');
    expect(summary).toHaveTextContent('Profit $10.40');
    await expectNoA11yViolations(container);
  });

  it('keeps the compact height and caller classes', async () => {
    const { container } = render(
      <MerchPricingSummary
        compact
        className='fixture-summary'
        salePrice='$28.00'
        profit='$10.40'
      />
    );

    expect(screen.getByTestId('merch-pricing-summary')).toHaveClass(
      'min-h-12',
      'fixture-summary'
    );
    await expectNoA11yViolations(container);
  });

  it('renders a pending profit as the fallback amount', async () => {
    const { container } = render(
      <MerchPricingSummary salePrice='$28.00' profit='$0.00' />
    );

    expect(screen.getByText('$0.00')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left prices whole and axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <MerchPricingSummary salePrice='CA$1,249,999.99' profit='١٠٫٤٠ US$' />
      </div>
    );

    expect(screen.getByText('CA$1,249,999.99')).toBeInTheDocument();
    expect(screen.getByText('١٠٫٤٠ US$')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
