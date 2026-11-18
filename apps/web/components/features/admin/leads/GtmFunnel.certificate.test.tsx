import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('server-only', () => ({}));

const summary = vi.hoisted(() => ({
  contacted: 0,
  claimClicks: 0,
  signups: 0,
  paidConversions: 0,
}));
vi.mock('@/lib/leads/reporting', () => ({
  getLeadFunnelReport: vi.fn(async () => ({ summary })),
}));

import { GtmFunnel, GtmFunnelSkeleton } from './GtmFunnel';

const counts = {
  discovered: 145,
  qualified: 38,
  disqualified: 361,
  approved: 0,
  ingested: 6,
  rejected: 1,
};

describe('GtmFunnel certificate', () => {
  beforeEach(() => {
    Object.assign(summary, {
      contacted: 0,
      claimClicks: 0,
      signups: 0,
      paidConversions: 0,
    });
  });

  it('renders the four stages, rate and drop-offs, axe-clean', async () => {
    const { container } = render(await GtmFunnel({ counts }));

    const card = screen.getByTestId('gtm-pipeline-status');
    for (const label of ['Discovered', 'Qualified', 'Approved', 'Ingested']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(card).toHaveTextContent('Pipeline Scan');
    expect(screen.getByText('26%')).toBeInTheDocument();
    expect(screen.getByText(/361 Disqualified \(66%\)/)).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Outreach conversion');
    await expectNoA11yViolations(container);
  });

  it('shows the not-run message for all-zero counts, axe-clean', async () => {
    const { container } = render(
      await GtmFunnel({ counts: { discovered: 0, qualified: 0 } })
    );

    expect(screen.getByTestId('gtm-pipeline-status')).toHaveTextContent(
      "Pipeline hasn't run yet. Select a speed above to start."
    );
    expect(screen.queryByText('Pipeline Scan')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('omits the rate and drop-offs without a discovery base, axe-clean', async () => {
    const { container } = render(await GtmFunnel({ counts: { qualified: 1 } }));

    expect(screen.getByTestId('gtm-pipeline-scope')).toHaveTextContent(
      'All time · outreach leads · 1 total lead'
    );
    expect(screen.queryByText(/Disqualified/)).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('adds outreach conversion with paid only when there are paid conversions, axe-clean', async () => {
    Object.assign(summary, { contacted: 40, claimClicks: 10, signups: 4 });
    const first = render(await GtmFunnel({ counts }));
    expect(
      screen.getByText(/Outreach conversion · Leads created in last 30d/)
    ).toBeInTheDocument();
    expect(first.container).toHaveTextContent(
      'Contacted: 40 · Claim clicks: 10 (25%) · Signed up: 4'
    );
    expect(first.container).not.toHaveTextContent('Paid:');
    first.unmount();

    summary.paidConversions = 2;
    const { container } = render(await GtmFunnel({ counts }));
    expect(container).toHaveTextContent('Signed up: 4 · Paid: 2');
    await expectNoA11yViolations(container);
  });

  it('renders an axe-clean skeleton', async () => {
    const { container } = render(<GtmFunnelSkeleton />);

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(9);
    await expectNoA11yViolations(container);
  });
});
