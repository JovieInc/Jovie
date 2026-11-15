import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';

function card(id: string, title: string): OpportunityInboxCardViewModel {
  return {
    id,
    signalType: 'other',
    typeLabel: 'Suggestion',
    title,
    why: `Why ${title}`,
    createdAt: '2026-07-01T12:00:00.000Z',
    primaryActionLabel: 'Review',
    status: 'pending',
    category: 'suggestion',
  };
}

const cards = [
  card('a', 'Detroit listeners up 340%'),
  card('b', 'Playlist window this week'),
  card('c', 'Campaign results'),
  card('d', 'Should stay hidden'),
];

describe('ChatEmptyStateOpportunityCards certificate', () => {
  it('lists at most three cards in a labelled list, axe-clean', async () => {
    const { container } = render(
      <ChatEmptyStateOpportunityCards cards={cards} onSelect={vi.fn()} />
    );

    const list = screen.getByRole('list', { name: 'Pending Opportunities' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByText('Should stay hidden')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('passes the chosen card to onSelect', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <ChatEmptyStateOpportunityCards cards={cards} onSelect={onSelect} />
    );

    await user.click(screen.getByTestId('chat-empty-opportunity-card-b'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(cards[1]);
  });

  it('renders nothing for an empty inbox', async () => {
    const { container } = render(
      <ChatEmptyStateOpportunityCards cards={[]} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('keeps right-to-left cards axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatEmptyStateOpportunityCards
          cards={[card('rtl', 'راجع قائمة الإصدار')]}
          onSelect={vi.fn()}
        />
      </div>
    );
    expect(screen.getByText('راجع قائمة الإصدار')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
