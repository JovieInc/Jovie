import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatActionCard } from './ChatActionCard';

describe('ChatActionCard', () => {
  it('renders the tool-call card on named System B primitives', () => {
    render(
      <ChatActionCard
        title='Review imported links'
        body='Jovie found three profile links that need confirmation before they appear publicly.'
        actionLabel='Review links'
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByTestId('chat-action-card')).toHaveClass(
      'system-b-chat-action-card'
    );
    expect(screen.getByText('Review imported links')).toHaveClass(
      'system-b-chat-action-card-title'
    );
    expect(
      screen.getByText(
        'Jovie found three profile links that need confirmation before they appear publicly.'
      )
    ).toHaveClass('system-b-chat-action-card-body');
    expect(screen.getByRole('button', { name: 'Review links' })).toHaveClass(
      'system-b-chat-action-card-primary'
    );
    expect(
      screen.getByRole('button', { name: 'Dismiss Review imported links' })
    ).toHaveClass('system-b-chat-action-card-dismiss');
  });

  it('keeps exactly one primary action and one dismiss action wired', () => {
    const onAct = vi.fn();
    const onDismiss = vi.fn();

    render(
      <ChatActionCard
        title='Confirm venue data'
        body='The imported venue profile has conflicting capacity metadata.'
        actionLabel='Confirm'
        onAct={onAct}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Confirm venue data' })
    );

    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
