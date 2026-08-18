import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CostsTable } from '@/app/app/(shell)/admin/costs/CostsTable';

const ITEM = {
  label: 'Vercel',
  monthlyUsd: 20,
  observed30dUsd: 12.5,
  period: 'monthly',
  notes: 'Application hosting',
  externalUrl: 'https://vercel.com/acme',
  lastUpdatedLabel: 'Today',
};

describe('CostsTable', () => {
  it('uses the canonical table anatomy and an accessible external action', () => {
    render(<CostsTable items={[ITEM]} lastRefreshedLabel='Today' />);

    expect(screen.getByTestId('admin-costs-table')).toBeInTheDocument();
    expect(
      screen.getByText('1 items • $12.50 in last 30d')
    ).toBeInTheDocument();
    expect(screen.getByText('Last refreshed: Today')).toBeInTheDocument();
    expect(screen.getByText('Application hosting')).toBeInTheDocument();

    const action = screen.getByRole('link', {
      name: 'Open Vercel dashboard',
    });
    expect(action).toHaveAttribute('href', 'https://vercel.com/acme');
    expect(action).toHaveAttribute('target', '_blank');
    expect(action).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the canonical empty table state', () => {
    render(<CostsTable items={[]} lastRefreshedLabel='Not recorded' />);

    expect(screen.getByText('No cost items')).toBeInTheDocument();
    expect(
      screen.getByText('Cost data is unavailable in this environment.')
    ).toBeInTheDocument();
  });
});
