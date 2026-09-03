import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('InvestorUpdateReview approval state', () => {
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
});
