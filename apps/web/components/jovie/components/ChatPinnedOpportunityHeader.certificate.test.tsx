import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatPinnedOpportunityHeader } from './ChatPinnedOpportunityHeader';

const card: OpportunityInboxCardViewModel = {
  id: 'opp_1',
  signalType: 'other',
  typeLabel: 'New song',
  createdAt: '2026-11-01T00:00:00.000Z',
  title: 'Pitch Sober',
  why: 'The release goes live Friday.',
  primaryActionLabel: 'Open pitch',
  status: 'pending',
  category: 'suggestion',
};

describe('ChatPinnedOpportunityHeader certificate', () => {
  it('shows the opportunity copy without forced capitals', async () => {
    const { container } = render(
      <ChatPinnedOpportunityHeader card={card} onUnpin={vi.fn()} />
    );

    const label = screen.getByText('New song');
    expect(label.className).not.toContain('uppercase');
    expect(screen.getByText('Pitch Sober')).toBeInTheDocument();
    expect(screen.getByText('The release goes live Friday.')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('unpins when the unpin button is pressed', async () => {
    const user = userEvent.setup();
    const onUnpin = vi.fn();
    const { container } = render(
      <ChatPinnedOpportunityHeader card={card} onUnpin={onUnpin} />
    );

    await user.click(screen.getByRole('button', { name: 'Unpin Opportunity' }));

    expect(onUnpin).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps an empty reason axe-clean', async () => {
    const { container } = render(
      <ChatPinnedOpportunityHeader
        card={{ ...card, why: '' }}
        onUnpin={vi.fn()}
      />
    );

    expect(screen.getByTestId('chat-pinned-opportunity-unpin')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
