import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';

import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';

const cards: readonly OpportunityInboxCardViewModel[] = [
  {
    id: 'card-1',
    typeLabel: 'Suggestion',
    createdAt: '2026-07-01T12:00:00.000Z',
    title: 'Detroit listeners up 340%',
    why: 'Promoter at Magic Stick reached out.',
    primaryActionLabel: 'Review pitch',
    status: 'pending',
    category: 'suggestion',
  },
  {
    id: 'card-2',
    typeLabel: 'Suggestion',
    createdAt: '2026-07-02T12:00:00.000Z',
    title: 'Playlist window this week',
    why: 'Your latest single is peaking.',
    primaryActionLabel: 'Draft pitch',
    status: 'pending',
    category: 'suggestion',
  },
  {
    id: 'card-3',
    typeLabel: 'Report',
    createdAt: '2026-07-03T12:00:00.000Z',
    title: 'Campaign results',
    why: 'Streams rose 12%.',
    primaryActionLabel: 'Plan next step',
    status: 'pending',
    category: 'report',
  },
  {
    id: 'card-4',
    typeLabel: 'Suggestion',
    createdAt: '2026-07-04T12:00:00.000Z',
    title: 'Should not render',
    why: 'Fourth card is capped.',
    primaryActionLabel: 'Approve',
    status: 'pending',
    category: 'suggestion',
  },
];

describe('ChatEmptyStateOpportunityCards', () => {
  it('renders up to 3 compact cards and ignores extras', () => {
    render(<ChatEmptyStateOpportunityCards cards={cards} onSelect={vi.fn()} />);

    expect(
      screen.getByTestId('chat-empty-state-opportunity-cards')
    ).toBeTruthy();
    expect(screen.getByText('Detroit listeners up 340%')).toBeTruthy();
    expect(screen.getByText('Playlist window this week')).toBeTruthy();
    expect(screen.getByText('Campaign results')).toBeTruthy();
    expect(screen.queryByText('Should not render')).toBeNull();
  });

  it('calls onSelect when a card is activated', () => {
    const onSelect = vi.fn();
    render(
      <ChatEmptyStateOpportunityCards cards={cards} onSelect={onSelect} />
    );

    fireEvent.click(screen.getByTestId('chat-empty-opportunity-card-card-1'));
    expect(onSelect).toHaveBeenCalledWith(cards[0]);
  });

  it('renders nothing when there are zero cards', () => {
    const { container } = render(
      <ChatEmptyStateOpportunityCards cards={[]} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
