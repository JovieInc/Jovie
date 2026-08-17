import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpportunityCardStack } from './OpportunityCardStack';

const CARDS = [
  {
    id: 'card-1',
    signalType: 'other' as const,
    typeLabel: 'Suggestion',
    createdAt: '2026-06-28T10:00:00.000Z',
    title: 'Detroit listeners up 340% — book a show',
    why: 'Promoter email matched your Detroit growth spike.',
    primaryActionLabel: 'Review pitch',
    status: 'pending' as const,
    category: 'suggestion' as const,
  },
  {
    id: 'card-2',
    signalType: 'new_song' as const,
    typeLabel: 'New Song',
    createdAt: '2026-06-27T10:00:00.000Z',
    title: 'New single detected',
    why: 'Spotify catalog signal.',
    primaryActionLabel: 'Set up release',
    status: 'pending' as const,
    category: 'suggestion' as const,
  },
];

describe('OpportunityCardStack', () => {
  it('keeps stack-level keyboard commands direct and predictable', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onReject = vi.fn();
    const onOpen = vi.fn();

    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={onAccept}
        onReject={onReject}
        onOpen={onOpen}
      />
    );

    const keyboardControl = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });
    keyboardControl.focus();

    await user.keyboard('{ArrowRight}{ArrowLeft}{Enter}');

    expect(onAccept).toHaveBeenCalledWith('card-1');
    expect(onReject).toHaveBeenCalledWith('card-1');
    expect(onOpen).toHaveBeenCalledWith('card-1');
  });

  it('does not replace a focused child action with the stack Enter command', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onOpen = vi.fn();

    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={onAccept}
        onReject={vi.fn()}
        onOpen={onOpen}
      />
    );

    const plan = screen.getByRole('button', { name: 'Review pitch' });
    plan.focus();
    await user.keyboard('{Enter}');

    expect(onAccept).toHaveBeenCalledWith('card-1');
    expect(onOpen).not.toHaveBeenCalled();
    expect(plan).toHaveFocus();
  });

  it.each([
    ['Meta', { metaKey: true }],
    ['Control', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
  ])('does not claim %s+ArrowRight from the keyboard control', (_name, keys) => {
    const onAccept = vi.fn();

    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={onAccept}
        onReject={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    const keyboardControl = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });

    expect(
      fireEvent.keyDown(keyboardControl, { key: 'ArrowRight', ...keys })
    ).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('respects a stack key event already handled by an ancestor', () => {
    const onAccept = vi.fn();

    render(
      <div onKeyDownCapture={event => event.preventDefault()}>
        <OpportunityCardStack
          cards={CARDS}
          onAccept={onAccept}
          onReject={vi.fn()}
          onOpen={vi.fn()}
        />
      </div>
    );

    const keyboardControl = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });

    expect(fireEvent.keyDown(keyboardControl, { key: 'ArrowRight' })).toBe(
      false
    );
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('does not process a repeated queue action key', () => {
    const onAccept = vi.fn();

    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={onAccept}
        onReject={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(
      fireEvent.keyDown(
        screen.getByRole('button', { name: 'Review Current Opportunity' }),
        { key: 'ArrowRight', repeat: true }
      )
    ).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('keeps direct accept and dismiss controls available without hover', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const onReject = vi.fn();

    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={onAccept}
        onReject={onReject}
        onOpen={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Review pitch' }));
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Opportunity' })
    );

    expect(onAccept).toHaveBeenCalledWith('card-1');
    expect(onReject).toHaveBeenCalledWith('card-1');
  });

  it('keeps peek actions inert and rows owned by real lists', () => {
    render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByTestId('opportunity-stack-peek-card-2')).toHaveAttribute(
      'inert'
    );
    expect(
      screen.getByTestId('opportunity-stack-top-card-1').closest('ul')
    ).not.toBeNull();
  });

  it('retains the keyboard control focus when the parent advances to the next card', () => {
    const { rerender } = render(
      <OpportunityCardStack
        cards={CARDS}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onOpen={vi.fn()}
      />
    );
    const keyboardControl = screen.getByRole('button', {
      name: 'Review Current Opportunity',
    });
    keyboardControl.focus();

    rerender(
      <OpportunityCardStack
        cards={CARDS.slice(1)}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(keyboardControl).toHaveFocus();
    expect(screen.getByText('New single detected')).toBeInTheDocument();
  });
});
