import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatActionCard } from '../types';
import { ChatStarterActionsRail } from './ChatStarterActionsRail';

const cards: ChatActionCard[] = [
  {
    id: 'plan-release',
    title: 'Plan a Release',
    body: 'Plan the rollout.',
    actionLabel: 'Start Planning',
    prompt: 'Plan it.',
  },
  {
    id: 'review-signals',
    title: 'Review Signals',
    body: 'Review momentum.',
    actionLabel: 'Review Signals',
    prompt: 'Review it.',
  },
  {
    id: 'generate-album-art',
    title: 'Generate Art',
    body: 'Create a cover direction.',
    actionLabel: 'Generate Art',
    prompt: 'Create it.',
  },
];

describe('ChatStarterActionsRail', () => {
  it('uses direct pagination dots and keyboard navigation without auto-advance', async () => {
    const user = userEvent.setup();
    render(
      <ChatStarterActionsRail
        cards={cards}
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(
      screen.getByRole('group', { name: '1 of 3: Plan a Release' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: 'Show Starter Action 2 Of 3: Review Signals',
      })
    );
    fireEvent.keyDown(
      screen.getByRole('button', {
        name: 'Show Starter Action 2 Of 3: Review Signals',
      }),
      { key: 'ArrowLeft' }
    );
    expect(
      screen.getByRole('group', { name: '1 of 3: Plan a Release' })
    ).toBeInTheDocument();
  });

  it('renders at most three pagination dots', () => {
    render(
      <ChatStarterActionsRail
        cards={[
          ...cards,
          { ...cards[1], id: 'build-artist-profile', title: 'Build Profile' },
        ]}
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(
      screen.getAllByRole('button', { name: /Show Starter Action/ })
    ).toHaveLength(3);
  });

  it('shows one complete mobile card with an explicit More control', async () => {
    const user = userEvent.setup();
    render(
      <ChatStarterActionsRail
        cards={cards}
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getAllByTestId('chat-action-card')).toHaveLength(1);
    const more = screen.getByRole('button', {
      name: 'Show More Starter Actions',
    });
    expect(more).toHaveClass('focus-visible:ring-2');
    expect(more.parentElement).toHaveClass('sm:hidden', 'min-h-11');
    expect(screen.getByText('1 of 3')).toHaveClass('tabular-nums');

    await user.click(more);

    expect(
      screen.getByRole('group', { name: '2 of 3: Review Signals' })
    ).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('keeps endpoint controls mounted and retains dot focus at the boundary', async () => {
    const user = userEvent.setup();
    render(
      <ChatStarterActionsRail
        cards={cards}
        onAct={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const next = screen.getByRole('button', {
      name: 'Show Next Starter Action',
    });
    await user.click(next);
    await user.click(next);

    expect(next).toBeDisabled();
    expect(next).toBeInTheDocument();

    const finalDot = screen.getByRole('button', {
      name: 'Show Starter Action 3 Of 3: Generate Art',
    });
    finalDot.focus();
    fireEvent.keyDown(finalDot, { key: 'ArrowRight' });

    expect(finalDot).toHaveFocus();
    expect(
      screen.getByRole('group', { name: '3 of 3: Generate Art' })
    ).toBeInTheDocument();
  });
});
