import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CanonicalContactMetrics } from '@/lib/admin/contacts';
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

describe('CanonicalLifecycleFunnel', () => {
  it('links the total and every lifecycle stage to the canonical contacts view', () => {
    render(<CanonicalLifecycleFunnel metrics={metrics} />);

    expect(
      screen.getByRole('link', { name: 'View all 1,234' })
    ).toHaveAttribute('href', '/app/ov/people?view=contacts');
    expect(screen.getByText('Suggested').closest('a')).toHaveAttribute(
      'href',
      '/app/ov/people?stage=suggested&view=contacts'
    );
    expect(screen.getByText('900')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(11);
  });

  it('keeps all stages visible when the lifecycle is empty', () => {
    const emptyMetrics = Object.fromEntries(
      Object.keys(metrics).map(key => [key, 0])
    ) as unknown as CanonicalContactMetrics;

    render(<CanonicalLifecycleFunnel metrics={emptyMetrics} />);

    expect(screen.getByRole('link', { name: 'View all 0' })).toBeVisible();
    expect(screen.getByText('Churned')).toBeVisible();
    expect(screen.getAllByText('0')).toHaveLength(10);
  });
});
