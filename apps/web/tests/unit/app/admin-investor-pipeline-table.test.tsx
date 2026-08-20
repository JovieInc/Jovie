import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/app/(shell)/admin/investors/TokenCopyButton', () => ({
  TokenCopyButton: ({ token }: { token: string }) => (
    <button type='button'>{token}</button>
  ),
}));

import { InvestorPipelineTable } from '@/app/app/(shell)/admin/investors/_components/InvestorPipelineTable';

const LINK = {
  id: 'link-1',
  token: 'investor-token',
  label: 'Seed Round',
  investorName: 'Acme Ventures',
  email: 'partner@acme.test',
  stage: 'engaged',
  engagementScore: 61,
  isActive: true,
  notes: null,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
  viewCount: 4,
  lastViewed: '2026-08-17T12:00:00Z',
};

describe('InvestorPipelineTable', () => {
  it('renders the complete investor pipeline contract', () => {
    render(<InvestorPipelineTable links={[LINK]} />);

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(header => header.textContent)
    ).toEqual([
      'Label',
      'Investor',
      'Stage',
      'Score',
      'Views',
      'Last Viewed',
      'Status',
    ]);
    expect(screen.getByText('Seed Round')).toBeInTheDocument();
    expect(screen.getByText('Acme Ventures')).toBeInTheDocument();
    expect(screen.getByText('Engaged')).toBeInTheDocument();
    expect(screen.getByText('61')).toHaveClass('text-success');
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'investor-token' })
    ).toBeInTheDocument();
  });

  it('renders the canonical actionable empty state', () => {
    render(<InvestorPipelineTable links={[]} />);

    expect(
      screen.getByRole('heading', { name: 'No investor links yet' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Create an investor link to begin tracking fundraising conversations.'
      )
    ).toBeInTheDocument();
  });

  it('renders inactive and incomplete pipeline states without invented data', () => {
    render(
      <InvestorPipelineTable
        links={[
          {
            ...LINK,
            investorName: null,
            email: null,
            isActive: false,
            lastViewed: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Unknown investor')).toBeInTheDocument();
    expect(screen.getByText('No views yet')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});
