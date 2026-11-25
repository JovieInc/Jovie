import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PricingOption } from '@/lib/queries';
import { MoneyVisibilityProvider } from '@/lib/workspace-lock/money-visibility';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { PlanComparisonSection } from './PlanComparisonSection';

const pricingOptions: PricingOption[] = [
  {
    priceId: 'price_pro_monthly',
    amount: 1900,
    currency: 'usd',
    interval: 'month',
    description: 'Pro monthly plan',
  },
];

function renderSection(
  props: Partial<Parameters<typeof PlanComparisonSection>[0]> = {},
  hidden = false
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MoneyVisibilityProvider hidden={hidden}>
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

describe('PlanComparisonSection certificate', () => {
  it('is axe-clean and uses the success token for included features', async () => {
    const { container } = renderSection();

    expect(container.querySelector('.text-success')).not.toBeNull();
    expect(container.innerHTML).not.toContain('emerald');
    await expectNoA11yViolations(container);
  });

  it('marks the current plan as disabled', async () => {
    const { container } = renderSection({ currentPlan: 'pro' });

    expect(screen.getByRole('button', { name: /Current Plan/ })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('falls back to coming soon without price options', async () => {
    const { container } = renderSection({
      pricingOptions: [],
      defaultPriceId: undefined,
    });

    expect(
      screen.getAllByRole('button', { name: 'Coming Soon' })[0]
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('offers an enabled upgrade button that takes focus from the keyboard', async () => {
    const user = userEvent.setup();
    const { container } = renderSection();

    await user.tab();
    const upgrade = screen.getByRole('button', { name: /Upgrade to/ });
    expect(upgrade).toBeEnabled();
    upgrade.focus();
    expect(upgrade).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('keeps hidden money axe-clean', async () => {
    const { container } = renderSection({}, true);

    expect(screen.getByText('Compare Plans')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
