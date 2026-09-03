import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { FounderReviewStack } from './FounderReviewStack';

const hoisted = vi.hoisted(() => ({
  createReview: vi.fn(),
  listReceipts: vi.fn(),
  deleteAudio: vi.fn(),
  updateOutcome: vi.fn(),
}));

vi.mock('@/lib/founder-review/client', () => ({
  createFounderReviewClient: hoisted.createReview,
  listFounderReviewReceipts: hoisted.listReceipts,
  deleteFounderReviewAudio: hoisted.deleteAudio,
  uploadFounderReviewAudio: vi.fn(),
  updateFounderReviewActionOutcome: hoisted.updateOutcome,
}));

const CARD = {
  id: 'card-1',
  sourceKind: 'test.suggestion',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending' as const,
  category: 'suggestion' as const,
} satisfies OpportunityInboxCardViewModel & { readonly sourceKind: string };

const RECEIPT = {
  id: 'receipt-1',
  target: {
    type: 'inbox-card' as const,
    id: 'card-1',
    title: CARD.title,
    sourceKind: CARD.sourceKind,
    category: CARD.category,
  },
  decision: 'approved' as const,
  recording: { mediaAvailable: false },
  actionOutcome: {
    status: 'pending' as const,
    updatedAt: '2026-09-01T18:00:08.000Z',
    errorCode: null,
  },
};

function renderStack(
  overrides: Partial<Parameters<typeof FounderReviewStack>[0]> = {}
) {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const keyboardControlRef = createRef<HTMLButtonElement>();
  render(
    <FounderReviewStack
      cards={[CARD]}
      onApprove={onApprove}
      onReject={onReject}
      keyboardControlRef={keyboardControlRef}
      {...overrides}
    />
  );
  return { onApprove, onReject, keyboardControlRef };
}

describe('FounderReviewStack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.listReceipts.mockResolvedValue([]);
    hoisted.createReview.mockResolvedValue(RECEIPT);
    hoisted.updateOutcome.mockImplementation(async input => ({
      ...RECEIPT,
      actionOutcome: {
        status: input.status,
        updatedAt: '2026-09-01T18:00:08.000Z',
        errorCode: input.errorCode,
      },
    }));
  });

  it('renders the single-card founder queue with source visual and rationale', () => {
    renderStack({
      cards: [
        {
          ...CARD,
          visual: {
            url: 'https://example.com/thumb.jpg',
            alt: 'Current thumbnail',
            fit: 'contain' as const,
          },
        },
      ],
    });

    expect(
      screen.getByTestId('founder-review-card-card-1')
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByAltText('Current thumbnail')).toBeInTheDocument();
    expect(
      screen.getByText('Promoter email matched your Detroit growth spike.')
    ).toBeVisible();
  });

  it('renders nothing when there are no stackable cards', () => {
    renderStack({ cards: [] });

    expect(
      screen.queryByTestId('founder-review-stack')
    ).not.toBeInTheDocument();
  });

  it('drives a canonical approve from the keyboard stack control', async () => {
    const { onApprove } = renderStack();
    const user = userEvent.setup();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Review Current Opportunity' })
    ).toHaveFocus();

    await user.keyboard('{ArrowRight}');

    await waitFor(() => expect(onApprove).toHaveBeenCalledWith('card-1'));
    expect(hoisted.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approved' })
    );
  });

  it('marks the active card busy while a canonical action is pending', () => {
    renderStack({ pendingActionId: 'card-1' });

    expect(screen.getByTestId('founder-review-card-card-1')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });
});
