import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type InvestorPipelineRow,
  InvestorPipelineTable,
} from './InvestorPipelineTable';

const ROWS: InvestorPipelineRow[] = [
  {
    id: 'sequoia',
    token: 'tok_sequoia_private',
    label: 'Seed memo',
    investorName: 'Sequoia Capital',
    stage: 'engaged',
    engagementScore: 61,
    viewCount: 4,
    lastViewedLabel: '10/5/2026',
    isActive: true,
  },
  {
    id: 'founders-fund',
    token: 'tok_founders_fund_private',
    label: 'Partner follow-up',
    investorName: 'Founders Fund',
    stage: 'meeting_booked',
    engagementScore: 48,
    viewCount: 2,
    lastViewedLabel: '10/4/2026',
    isActive: false,
  },
];

const HEADERS = [
  'Label',
  'Investor',
  'Stage',
  'Score',
  'Views',
  'Last Viewed',
  'Status',
];

describe('InvestorPipelineTable', () => {
  it('renders every populated value in its own declared column', () => {
    render(<InvestorPipelineTable rows={[ROWS[0]!]} />);

    const table = screen.getByRole('table', { name: 'Investor pipeline' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(header => header.textContent)
    ).toEqual(HEADERS);

    const row = screen.getByTestId('admin-investor-row-sequoia');
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveTextContent('Seed memo');
    expect(cells[1]).toHaveTextContent('Sequoia Capital');
    expect(cells[2]).toHaveTextContent('Engaged');
    expect(cells[3]).toHaveTextContent('61');
    expect(cells[4]).toHaveTextContent('4');
    expect(cells[5]).toHaveTextContent('10/5/2026');
    expect(cells[6]).toHaveTextContent('Active');
  });

  it('keeps multiple records as separate seven-cell rows', () => {
    render(<InvestorPipelineTable rows={ROWS} />);

    const bodyRows = screen
      .getByRole('table', { name: 'Investor pipeline' })
      .querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      expect(row.querySelectorAll('td')).toHaveLength(7);
    }
    expect(screen.getByText('Founders Fund')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('uses the same seven-column table for loading and empty states', () => {
    const { rerender } = render(<InvestorPipelineTable rows={[]} isLoading />);

    let table = screen.getByRole('table', { name: 'Investor pipeline' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(table).toHaveStyle({ minWidth: '760px' });
    expect(table).toHaveClass('table-fixed');

    rerender(<InvestorPipelineTable rows={[]} />);
    table = screen.getByRole('table', { name: 'Investor pipeline' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getByTestId('admin-investors-empty-state')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Create Link' })).toHaveAttribute(
      'href',
      '/app/ov/investors/links'
    );
  });
});
