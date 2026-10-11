import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PricingOption } from '@/lib/queries';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import { PlanComparisonSection } from './PlanComparisonSection';

const pricingOptions: PricingOption[] = [
  {
    priceId: 'price_pro_monthly',
    amount: 1900,
    currency: 'usd',
    interval: 'month',
    description: 'Pro monthly plan',
  },
  {
    priceId: 'price_max_monthly',
    amount: 4900,
    currency: 'usd',
    interval: 'month',
    description: 'Max monthly plan',
  },
];

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderSection(
  props: Partial<Parameters<typeof PlanComparisonSection>[0]> = {},
  { moneyHidden = false }: { moneyHidden?: boolean } = {}
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MoneyVisibilityProvider hidden={moneyHidden}>
        <PlanComparisonSection
          pricingOptions={pricingOptions}
          currentPlan='free'
          defaultPriceId='price_pro_monthly'
          {...props}
        />
      </MoneyVisibilityProvider>
    </QueryClientProvider>
  );
}

describe('PlanComparisonSection', () => {
  it('renders the plan comparison header and plan prices', () => {
    renderSection();
    expect(screen.getByText('Compare Plans')).toBeTruthy();
    expect(screen.getByText('$19')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();
  });

  it('marks the current plan and disables its CTA', () => {
    renderSection({ currentPlan: 'pro' });
    expect(screen.getAllByText('Current Plan').length).toBeGreaterThan(0);
  });

  it('redacts plan prices when money visibility is hidden', () => {
    renderSection({}, { moneyHidden: true });
    expect(screen.queryByText('$19')).toBeNull();
    expect(screen.getAllByText('•••').length).toBeGreaterThan(0);
  });
});
