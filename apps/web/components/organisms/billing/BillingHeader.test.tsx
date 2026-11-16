import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getPlanDisplayName } from '@/lib/entitlements/registry';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { BillingHeader } from './BillingHeader';

describe('BillingHeader', () => {
  it('names the paid plan in the page summary', async () => {
    const { container } = render(<BillingHeader plan='pro' />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Billing' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Manage your ${getPlanDisplayName('pro')} plan, compare options, and review billing history.`
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the free plan name when there is no plan', async () => {
    const { container } = render(<BillingHeader plan={null} />);

    expect(
      screen.getByText(
        new RegExp(`Manage your ${getPlanDisplayName(null)} plan`)
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps one level-one heading inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <BillingHeader plan='max' />
      </div>
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});
