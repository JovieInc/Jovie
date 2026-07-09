import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';

import { ChatPinnedOpportunityHeader } from './ChatPinnedOpportunityHeader';

const card: OpportunityInboxCardViewModel = {
  id: 'pin-1',
  typeLabel: 'Suggestion',
  createdAt: '2026-07-01T12:00:00.000Z',
  title: 'Detroit listeners up 340%',
  why: 'Promoter at Magic Stick reached out.',
  primaryActionLabel: 'Review pitch',
  status: 'pending',
  category: 'suggestion',
};

describe('ChatPinnedOpportunityHeader', () => {
  it('renders the pinned card summary', () => {
    render(<ChatPinnedOpportunityHeader card={card} onUnpin={vi.fn()} />);

    expect(screen.getByTestId('chat-pinned-opportunity-header')).toBeTruthy();
    expect(screen.getByText('Detroit listeners up 340%')).toBeTruthy();
    expect(
      screen.getByText('Promoter at Magic Stick reached out.')
    ).toBeTruthy();
  });

  it('calls onUnpin from the dismiss control', () => {
    const onUnpin = vi.fn();
    render(<ChatPinnedOpportunityHeader card={card} onUnpin={onUnpin} />);

    fireEvent.click(screen.getByTestId('chat-pinned-opportunity-unpin'));
    expect(onUnpin).toHaveBeenCalledTimes(1);
  });
});
