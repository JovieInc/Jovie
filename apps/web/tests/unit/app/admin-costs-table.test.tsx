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
    expect(screen.getByRole('table')).toHaveAttribute(
      'data-table-row-mode',
      'description'
    );
    expect(
      screen.getByText(
        '1 items • $12.50 recorded in last 30d • 1/1 items observed'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Last refreshed: Today')).toBeInTheDocument();
    expect(screen.getByText('Application hosting')).toBeInTheDocument();
    expect(
      screen
        .getByText('Application hosting')
        .closest('[data-table-cell-content]')
    ).toHaveClass('whitespace-normal');

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
      screen.getByText(
        'No manual cost records have been added. Spend has not been observed.'
      )
    ).toBeInTheDocument();
  });
  it.each([null, '', 'invalid'])(
    'does not turn unobserved spend (%s) into zero',
    value => {
      render(
        <CostsTable
          items={[{ ...ITEM, observed30dUsd: value }]}
          lastRefreshedLabel='Not recorded'
        />
      );
      expect(screen.getByText('Not observed')).toBeInTheDocument();
      expect(screen.getByText(/Spend not observed/)).toBeInTheDocument();
      expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    }
  );

  it('preserves an explicitly recorded zero amount', () => {
    render(
      <CostsTable
        items={[{ ...ITEM, observed30dUsd: 0 }]}
        lastRefreshedLabel='Today'
      />
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText(/1\/1 items observed/)).toBeInTheDocument();
  });
});
