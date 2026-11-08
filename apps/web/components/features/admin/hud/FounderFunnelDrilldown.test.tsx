import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { FounderFunnelDrilldown } from './FounderFunnelDrilldown';

const baseResult: FounderFunnelStageRows = {
  stage: 'accounts_created',
  stageLabel: 'Accounts created',
  stageDescription: 'Created an account',
  timeRange: '30d',
  total: 2,
  rows: [
    {
      id: 'u1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enteredAt: '2026-09-20T12:00:00.000Z',
    },
    {
      id: 'u2',
      displayName: null,
      email: null,
      enteredAt: null,
    },
  ],
  limit: 100,
  errors: [],
  definitionVersion: 'founder-funnel.v2',
};

describe('FounderFunnelDrilldown', () => {
  it('renders the stage heading, cohort window, and back link', () => {
    render(<FounderFunnelDrilldown result={baseResult} />);

    expect(
      screen.getByRole('heading', { name: 'Accounts created · 2 people' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Created an account — last 30 days cohort.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Clear drill-down' })
    ).toHaveAttribute('href', '/app/ov/growth?view=leads');
  });

  it('lists each record with fallback placeholders for missing fields', () => {
    render(<FounderFunnelDrilldown result={baseResult} />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    // The nameless row shows the shared empty marker for person and date.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders records through the shared dense people table', () => {
    render(<FounderFunnelDrilldown result={baseResult} />);

    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map(header => header.textContent);
    expect(headers).toEqual(['Person', 'Signed Up']);
    const [, firstRow] = within(table).getAllByRole('row');
    expect(firstRow.className).toContain('system-b-table-row-shell');
    expect(
      firstRow.querySelector('[data-table-person-cell]')
    ).toHaveTextContent('Ada Lovelace');
    const date = within(firstRow).getByText('Sep 20, 2026');
    expect(date.closest('td')?.className).toContain('text-right');
  });

  it('falls back to the email as the name when there is no display name', () => {
    render(
      <FounderFunnelDrilldown
        result={{
          ...baseResult,
          rows: [
            {
              id: 'u3',
              displayName: null,
              email: 'grace@example.com',
              enteredAt: null,
            },
          ],
        }}
      />
    );

    expect(screen.getByText('grace@example.com')).toBeInTheDocument();
  });

  it('notes when the row list is truncated by the limit', () => {
    render(
      <FounderFunnelDrilldown
        result={{ ...baseResult, total: 250, limit: 100 }}
      />
    );

    expect(
      screen.getByText('Showing first 2 of 250 records.')
    ).toBeInTheDocument();
  });

  it('shows an empty state when the stage has no records', () => {
    render(
      <FounderFunnelDrilldown result={{ ...baseResult, total: 0, rows: [] }} />
    );

    expect(
      screen.getByTestId('founder-funnel-drilldown-empty')
    ).toHaveTextContent('No Records In This Stage');
  });

  it('surfaces query errors instead of the table', () => {
    render(
      <FounderFunnelDrilldown
        result={{ ...baseResult, errors: ['stage query failed'] }}
      />
    );

    expect(screen.getByText('stage query failed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
