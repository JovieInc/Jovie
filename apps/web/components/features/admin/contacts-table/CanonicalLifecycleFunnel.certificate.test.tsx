import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { CanonicalContactMetrics } from '@/lib/admin/contacts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CanonicalLifecycleFunnel } from './CanonicalLifecycleFunnel';

const metrics: CanonicalContactMetrics = {
  total: 1234,
  suggested: 900,
  approved: 120,
  outreach: 80,
  profile_created: 50,
  certified: 30,
  signed_up: 20,
  claimed: 14,
  activated: 10,
  paying: 8,
  churned: 2,
};

describe('CanonicalLifecycleFunnel certificate', () => {
  it('walks the total and stage links by keyboard in lifecycle order', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CanonicalLifecycleFunnel metrics={metrics} />
    );
    await user.tab();
    expect(screen.getByRole('link', { name: 'View all 1,234' })).toHaveFocus();
    await user.tab();
    const suggested = screen.getByText('Suggested').closest('a');
    expect(suggested).toHaveFocus();
    expect(suggested).toHaveAttribute(
      'href',
      '/app/ov/people?stage=suggested&view=contacts'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps an all-zero lifecycle axe-clean', async () => {
    const empty = Object.fromEntries(
      Object.keys(metrics).map(key => [key, 0])
    ) as unknown as CanonicalContactMetrics;
    const { container } = render(<CanonicalLifecycleFunnel metrics={empty} />);
    expect(screen.getByRole('link', { name: 'View all 0' })).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('keeps long counts in an RTL document axe-clean', async () => {
    const long = Object.fromEntries(
      Object.keys(metrics).map(key => [key, 98_765_432])
    ) as unknown as CanonicalContactMetrics;
    const { container } = render(
      <div dir='rtl'>
        <CanonicalLifecycleFunnel metrics={long} />
      </div>
    );
    expect(
      screen.getByRole('link', { name: 'View all 98,765,432' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
