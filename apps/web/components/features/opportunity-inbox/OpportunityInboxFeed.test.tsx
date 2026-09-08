import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

vi.mock('./FounderReviewStack', () => ({
  FounderReviewStack: ({
    cards,
  }: {
    cards: readonly OpportunityInboxCardViewModel[];
  }) => (
    <div data-testid='founder-stack'>
      {cards.map(card => card.id).join(',')}
    </div>
  ),
}));

const CAPTURE_CARD: OpportunityInboxCardViewModel = {
  id: 'capture-1',
  sourceKind: 'jovie.workflow_capture.request',
  signalType: 'other',
  typeLabel: 'Workflow',
  createdAt: '2026-08-28T10:00:00.000Z',
  title: 'Record a browser workflow',
  why: 'Show Jovie the exact steps.',
  primaryActionLabel: 'Record',
  status: 'pending',
  category: 'workflow_capture',
  workflowCapture: {
    instructions: 'Stop before publishing.',
    startUrl: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    state: 'pending',
  },
};

const SUGGESTION_CARD: OpportunityInboxCardViewModel = {
  ...CAPTURE_CARD,
  id: 'suggestion-1',
  typeLabel: 'Suggestion',
  title: 'Review a normal suggestion',
  primaryActionLabel: 'Approve',
  category: 'suggestion',
  workflowCapture: undefined,
};

describe('OpportunityInboxFeed workflow handoffs', () => {
  it('keeps Record requests visible and outside the founder decision stack', () => {
    render(
      <OpportunityInboxFeed
        cards={[CAPTURE_CARD, SUGGESTION_CARD]}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
        enableStackInteractions
      />
    );

    expect(screen.getByRole('button', { name: 'Record' })).toBeVisible();
    expect(screen.getByTestId('founder-stack')).toHaveTextContent(
      'suggestion-1'
    );
    expect(screen.getByTestId('founder-stack')).not.toHaveTextContent(
      'capture-1'
    );
  });
});
