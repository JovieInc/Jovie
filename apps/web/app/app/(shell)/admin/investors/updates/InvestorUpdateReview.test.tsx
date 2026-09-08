import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InvestorUpdateReviewState } from '@/lib/investors/update-contract';
import { InvestorUpdateReview } from './InvestorUpdateReview';

vi.mock('@/components/molecules/ContentSurfaceCard', () => ({
  ContentSurfaceCard: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const APPROVED_STATE: InvestorUpdateReviewState = {
  draft: {
    id: '11111111-1111-4111-8111-111111111111',
    periodStart: '2026-08-01',
    subject: 'Jovie August Update',
    updatedAt: '2026-08-29T16:00:00.000Z',
  },
  candidates: [],
  composition: {
    renderedCopy: 'Jovie August Update',
    includedCandidateIds: [],
    pendingCandidateIds: [],
  },
  latestApproval: {
    id: '22222222-2222-4222-8222-222222222222',
    renderedCopy: 'Jovie August Update',
    copyHash: 'hash',
    recipientSegments: [
      { role: 'investor', included: true, recipientCount: 12 },
      { role: 'advisor', included: false, recipientCount: 0 },
      { role: 'founder_self', included: true, recipientCount: 1 },
      { role: 'other_explicit', included: false, recipientCount: 0 },
    ],
    recipientCount: 13,
    approvedAt: '2026-08-29T16:00:00.000Z',
    expiresAt: '2099-08-29T16:15:00.000Z',
    matchesCurrentDraft: true,
  },
  deliveryEvents: [],
};

const PENDING_EDIT_STATE: InvestorUpdateReviewState = {
  draft: {
    id: '11111111-1111-4111-8111-111111111111',
    periodStart: '2026-08-01',
    subject: 'Jovie August Update',
    updatedAt: '2026-08-29T16:00:00.000Z',
  },
  candidates: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'win',
      category: 'shipping_velocity',
      metricLabel: 'Merged pull requests',
      metricValue: '19',
      metricUnit: 'count',
      windowStart: '2026-08-01T00:00:00.000Z',
      windowEnd: '2026-08-31T23:59:59.000Z',
      sourceRecordId: '44444444-4444-4444-8444-444444444444',
      sourceLabel: 'GitHub merged pull request receipt set',
      sourceUrl: 'https://github.com/JovieInc/Jovie/pulls?q=is%3Amerged',
      sourceObservedAt: '2026-08-29T16:00:00.000Z',
      confidence: 0.98,
      caveats: [
        'Shipping velocity is operating leverage, not customer traction.',
      ],
      proposedClaim: 'We merged 19 pull requests in August.',
      relevanceScore: 0.8,
      createdAt: '2026-08-29T16:00:00.000Z',
      decision: null,
    },
  ],
  composition: {
    renderedCopy: 'Jovie August Update',
    includedCandidateIds: [],
    pendingCandidateIds: ['33333333-3333-4333-8333-333333333333'],
  },
  latestApproval: null,
  deliveryEvents: [],
};

describe('InvestorUpdateReview approval state', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('locks exact approved segments until the founder starts a revision', () => {
    render(<InvestorUpdateReview initialState={APPROVED_STATE} />);

    expect(screen.getByText(/This did not send anything/)).toBeInTheDocument();
    expect(
      screen.getByLabelText('Founder self-copy recipient count')
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /Approve Exact Copy/ })
    ).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Start A New Revision' })
    );
    expect(
      screen.getByLabelText('Founder self-copy recipient count')
    ).toBeEnabled();
  });

  it('invalidates the green approval state when a recipient segment changes', () => {
    render(<InvestorUpdateReview initialState={APPROVED_STATE} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Start A New Revision' })
    );
    fireEvent.change(
      screen.getByLabelText('Founder self-copy recipient count'),
      { target: { value: '2' } }
    );

    expect(
      screen.getByText(/latest approval is expired or no longer matches/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/This did not send anything/)).toBeNull();
  });

  it('keeps the exact edited claim when a candidate decision request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Draft revision changed.' }),
      })
    );

    render(<InvestorUpdateReview initialState={PENDING_EDIT_STATE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(
      screen.getByLabelText('Exact Edited Investor-facing Claim'),
      { target: { value: 'We shipped 19 merged PRs with receipts.' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Use Exact Edit' }));

    await waitFor(() => {
      expect(screen.getByText('Draft revision changed.')).toBeInTheDocument();
    });
    expect(
      screen.getByLabelText('Exact Edited Investor-facing Claim')
    ).toHaveValue('We shipped 19 merged PRs with receipts.');
  });
});
