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
});
