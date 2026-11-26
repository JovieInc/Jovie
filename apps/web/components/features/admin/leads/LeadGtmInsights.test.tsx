import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  LeadFunnelBreakdownRow,
  LeadFunnelReport,
} from '@/lib/leads/reporting-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('server-only', () => ({}));

const { getLeadFunnelReport } = vi.hoisted(() => ({
  getLeadFunnelReport: vi.fn(),
}));
vi.mock('@/lib/leads/reporting', () => ({ getLeadFunnelReport }));

import { LeadGtmInsights, LeadGtmInsightsView } from './LeadGtmInsights';

function row(cohort: string): LeadFunnelBreakdownRow {
  return {
    cohort,
    scraped: 40,
    qualified: 22,
    approved: 14,
    contacted: 12,
    emailQueued: 9,
    dmSent: 3,
    claimClicks: 6,
    signups: 3,
    onboardingCompleted: 2,
    paidConversions: 1,
  };
}

function makeReport(
  overrides: Partial<LeadFunnelReport> = {}
): LeadFunnelReport {
  const { cohort: _cohort, ...summary } = row('all');
  return {
    filters: { start: '2026-09-01', end: '2026-09-30' },
    summary,
    sourceBreakdown: [row('linktree')],
    musicToolBreakdown: [row('distrokid')],
    pixelBreakdown: [],
    verifiedBreakdown: [],
    paidTierBreakdown: [],
    keywordBreakdown: [],
    rampRecommendation: {
      recommendedAction: 'increase',
      recommendedNextDailyCap: 30,
      reasons: ['Claim rate is healthy.', 'Failures are low.'],
      sampleSize: 120,
      claimClickRate: 0.2,
      providerFailureRate: 0,
    },
    ...overrides,
  };
}

describe('LeadGtmInsights', () => {
  it('renders the report from the async server component', async () => {
    getLeadFunnelReport.mockResolvedValueOnce(makeReport());

    const { container } = render(await LeadGtmInsights());

    expect(screen.getByText('GTM insights')).toBeInTheDocument();
    expect(screen.getByText('linktree')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('writes the ramp action in sentence case with no forced caps', () => {
    render(<LeadGtmInsightsView report={makeReport()} />);

    const action = screen.getByText('Increase');
    expect(action).toBeInTheDocument();
    expect(screen.getByText('Ramp recommendation').className).not.toMatch(
      /uppercase/
    );
    expect(screen.getByText(/Next daily cap: 30/)).toBeInTheDocument();
    expect(screen.getByText(/Claim rate is healthy. Failures/)).toBeVisible();
  });

  it('says so when a breakdown has no attributable data and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LeadGtmInsightsView
        report={makeReport({
          sourceBreakdown: [],
          musicToolBreakdown: [],
          pixelBreakdown: [],
        })}
      />
    );

    expect(screen.getAllByText('No attributable data yet.')).toHaveLength(3);
    await user.tab();
    await expectNoA11yViolations(container);
  });
});
