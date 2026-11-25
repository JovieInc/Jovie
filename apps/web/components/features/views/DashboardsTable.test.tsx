import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardsTable } from './DashboardsTable';

describe('DashboardsTable', () => {
  it('lists dashboards with title links, source and date', () => {
    const { container } = render(
      <DashboardsTable
        rows={[
          {
            id: '1',
            title: 'Weekly snapshot',
            token: 'a'.repeat(32),
            source: 'agent',
            updatedAt: '2026-11-22T00:00:00.000Z',
          },
          {
            id: '2',
            title: 'Mine',
            token: 'b'.repeat(32),
            source: 'user',
            updatedAt: '2026-11-21T00:00:00.000Z',
          },
        ]}
      />
    );
    expect(
      screen.getByRole('link', { name: 'Weekly snapshot' })
    ).toHaveAttribute('href', `/v/${'a'.repeat(32)}`);
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('2026-11-22')).toBeInTheDocument();
    // New tables use the shared compact rows; dense is a shrinking legacy set.
    expect(
      container.querySelector('[data-table-row-mode="compact"]')
    ).not.toBeNull();
  });

  it('shows the flat empty state', () => {
    render(<DashboardsTable rows={[]} />);
    expect(
      screen.getByText(
        'No dashboards yet. Open a view an agent shares with you and save it here.'
      )
    ).toBeInTheDocument();
  });
});
