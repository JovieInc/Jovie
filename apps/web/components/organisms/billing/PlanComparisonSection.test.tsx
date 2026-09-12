import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/queries', () => ({
  useCheckoutMutation: () => ({ mutate: vi.fn() }),
  useGrowthAccessRequestMutation: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
  useFeatureFlag: () => false,
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: {
      children?: ReactNode;
      [key: string]: unknown;
    }) => <div {...props}>{children}</div>,
  },
}));

import { PlanComparisonSection } from './PlanComparisonSection';

const pricingOptions = [
  {
    priceId: 'price_pro_month',
    amount: 3900,
    currency: 'usd',
    interval: 'month',
    description: 'Pro monthly',
  },
  {
    priceId: 'price_pro_year',
    amount: 37500,
    currency: 'usd',
    interval: 'year',
    description: 'Pro annual',
  },
  {
    priceId: 'price_max_month',
    amount: 14900,
    currency: 'usd',
    interval: 'month',
    description: 'Max monthly',
  },
  {
    priceId: 'price_max_year',
    amount: 143000,
    currency: 'usd',
    interval: 'year',
    description: 'Max annual',
  },
];

describe('PlanComparisonSection', () => {
  it('keeps the billing interval selector canonical and accessible', () => {
    render(
      <PlanComparisonSection
        pricingOptions={pricingOptions}
        currentPlan={null}
        defaultPriceId='price_pro_month'
      />
    );

    const selector = screen.getByTestId('billing-plan-interval');
    expect(selector).toBeInTheDocument();
    for (const name of ['Monthly', 'Annual']) {
      const option = screen.getByRole('button', { name });
      expect(option).toHaveAttribute('data-variant', 'tertiary');
      expect(option).toHaveAttribute('data-size', 'md');
      expect(option).toHaveAttribute('aria-pressed');
    }
  });

  it('switches plan prices and interval labels from the selector', async () => {
    const user = userEvent.setup();
    render(
      <PlanComparisonSection
        pricingOptions={pricingOptions}
        currentPlan={null}
        defaultPriceId='price_pro_month'
      />
    );

    await user.click(screen.getByRole('button', { name: 'Annual' }));

    expect(screen.getAllByText('$375').length).toBeGreaterThan(0);
    expect(screen.getAllByText('/yr').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/billed annually/).length).toBeGreaterThan(0);
  });
});
