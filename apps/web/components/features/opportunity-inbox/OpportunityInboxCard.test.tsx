import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityInboxCard } from './OpportunityInboxCard';

const CARD = {
  id: 'card-1',
  typeLabel: 'Suggestion',
  createdAt: '2026-06-28T10:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Review pitch',
  status: 'pending' as const,
  category: 'suggestion' as const,
};

describe('OpportunityInboxCard', () => {
  it('renders card metadata, copy, and actions', () => {
    render(
      <OpportunityInboxCard
        card={CARD}
        onApprove={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />
    );

    expect(
      screen.getByText('Detroit listeners up 340% — book a show')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Promoter email matched your Detroit growth spike.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Review pitch/ })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('fires approve, dismiss, and feedback handlers', () => {
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    const onFeedback = vi.fn();

    render(
      <OpportunityInboxCard
        card={CARD}
        onApprove={onApprove}
        onDismiss={onDismiss}
        onFeedback={onFeedback}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Review pitch/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark Suggestion Helpful' })
    );

    expect(onApprove).toHaveBeenCalledWith('card-1');
    expect(onDismiss).toHaveBeenCalledWith('card-1');
    expect(onFeedback).toHaveBeenCalledWith('card-1', 'positive', undefined);
  });
});
