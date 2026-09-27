import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/leads/reporting', () => ({
  getLeadFunnelReport: vi.fn(async () => ({
    summary: { contacted: 0, claimClicks: 0, signups: 0, paidConversions: 0 },
  })),
}));

describe('GtmFunnel drop-off rates', () => {
  it('computes disqualified and rejected percentages against total leads', async () => {
    const { GtmFunnel } = await import(
      '@/components/features/admin/leads/GtmFunnel'
    );

    render(
      await GtmFunnel({
        counts: {
          discovered: 145,
          qualified: 38,
          disqualified: 361,
          approved: 0,
          ingested: 6,
          rejected: 1,
        },
      })
    );

    expect(screen.getByText(/361 Disqualified \(66%\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 Rejected \(0%\)/)).toBeInTheDocument();
  });
});
