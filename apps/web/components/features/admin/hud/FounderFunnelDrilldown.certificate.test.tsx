import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FounderFunnelDrilldown } from './FounderFunnelDrilldown';

const result: FounderFunnelStageRows = {
  stage: 'accounts_created',
  stageLabel: 'Accounts created',
  stageDescription: 'Created an account',
  timeRange: '7d',
  total: 1,
  rows: [
    {
      id: 'u1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enteredAt: '2026-09-20T12:00:00.000Z',
    },
  ],
  limit: 100,
  errors: [],
  definitionVersion: 'founder-funnel.v2',
};

describe('FounderFunnelDrilldown certificate', () => {
  it('keeps the other search params on the back link and focuses it by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <FounderFunnelDrilldown
        result={result}
        urlSearchParams='view=leads&funnelStage=accounts_created&funnelRange=7d'
      />
    );
    expect(
      screen.getByRole('heading', { name: 'Accounts created · 1 person' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Created an account — last 7 days cohort.')
    ).toBeInTheDocument();
    const back = screen.getByRole('link', { name: 'Clear drill-down' });
    expect(back.getAttribute('href')).toMatch(/\?view=leads&funnelRange=7d$/);
    expect(back.getAttribute('href')).not.toContain('funnelStage');
    await user.tab();
    expect(back).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('joins every stage error and drops the table', async () => {
    const { container } = render(
      <FounderFunnelDrilldown
        result={{ ...result, errors: ['stage query failed', 'timed out'] }}
      />
    );
    expect(
      screen.getByText('stage query failed; timed out')
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the empty stage state axe-clean', async () => {
    const { container } = render(
      <FounderFunnelDrilldown
        result={{ ...result, timeRange: 'all', total: 0, rows: [] }}
      />
    );
    expect(screen.getByText('No Records In This Stage')).toBeInTheDocument();
    expect(
      screen.getByText('Created an account — all time cohort.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('notes a truncated first page and stays axe-clean in RTL', async () => {
    const { container } = render(
      <div dir='rtl'>
        <FounderFunnelDrilldown result={{ ...result, total: 12_480 }} />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'Accounts created · 12,480 people' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('Showing first 1 of 12,480 records.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Accounts created records' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
