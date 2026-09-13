import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

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

describe('OpportunityInboxFeed customer boundary', () => {
  it('keeps Record requests visible and uses the customer card stack', () => {
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
    expect(screen.getByTestId('opportunity-card-stack')).toBeVisible();
    expect(screen.getByText('Review a normal suggestion')).toBeVisible();
    expect(
      screen.queryByTestId('founder-review-stack')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Founder Review')).not.toBeInTheDocument();
  });
});
