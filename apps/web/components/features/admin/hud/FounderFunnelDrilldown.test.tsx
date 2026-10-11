import { render, screen } from '@testing-library/react';
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
    expect(screen.getAllByText('—')).toHaveLength(3);
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
      screen.getByText('No records in this stage for the selected window.')
    ).toBeInTheDocument();
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
