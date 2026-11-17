import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

function renderRail(list = cards) {
  const onAct = vi.fn();
  const onDismiss = vi.fn();
  const view = render(
    <ChatStarterActionsRail cards={list} onAct={onAct} onDismiss={onDismiss} />
  );
  return { ...view, onAct, onDismiss };
}

describe('ChatStarterActionsRail certificate', () => {
  it('shows the first starter as a labelled slide, axe-clean', async () => {
    const { container } = renderRail();

    expect(
      screen.getByRole('region', { name: 'Starter Actions' })
    ).toHaveAttribute('aria-roledescription', 'carousel');
    expect(
      screen.getByRole('group', { name: '1 of 3: Plan a Release' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show Previous Starter Action' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('acts on and dismisses the visible starter with that card', async () => {
    const user = userEvent.setup();
    const { onAct, onDismiss } = renderRail();

    await user.click(
      screen.getByRole('button', { name: 'Start Planning — Plan a Release' })
    );
    await user.click(
      screen.getByRole('button', { name: 'Dismiss Plan a Release' })
    );

    expect(onAct).toHaveBeenCalledWith(cards[0]);
    expect(onDismiss).toHaveBeenCalledWith(cards[0]);
  });

  it('pages with next, more, dots and the arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    const { container, onAct } = renderRail();

    await user.click(
      screen.getByRole('button', { name: 'Show Next Starter Action' })
    );
    expect(
      screen.getByRole('group', { name: '2 of 3: Review Signals' })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show More Starter Actions' })
    );
    expect(
      screen.getByRole('group', { name: '3 of 3: Generate Art' })
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Show More Starter Actions' })
    );
    expect(
      screen.getByRole('group', { name: '1 of 3: Plan a Release' })
    ).toBeInTheDocument();

    const dot = screen.getByRole('button', {
      name: 'Show Starter Action 2 Of 3: Review Signals',
    });
    await user.click(dot);
    expect(dot).toHaveAttribute('aria-current', 'true');

    await user.keyboard('{End}');
    expect(
      screen.getByRole('group', { name: '3 of 3: Generate Art' })
    ).toBeInTheDocument();
    screen
      .getByRole('button', { name: 'Show Starter Action 3 Of 3: Generate Art' })
      .focus();
    await user.keyboard('{ArrowLeft}');
    expect(
      screen.getByRole('group', { name: '2 of 3: Review Signals' })
    ).toBeInTheDocument();
    screen
      .getByRole('button', {
        name: 'Show Starter Action 2 Of 3: Review Signals',
      })
      .focus();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Home}');
    expect(
      screen.getByRole('group', { name: '1 of 3: Plan a Release' })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Start Planning — Plan a Release' })
    );
    expect(onAct).toHaveBeenCalledWith(cards[0]);
    await expectNoA11yViolations(container);
  });

  it('renders nothing without cards and hides paging for one card', async () => {
    const { container, unmount } = renderRail([]);
    expect(container).toBeEmptyDOMElement();
    unmount();

    const single = renderRail([cards[0]!]);
    expect(
      screen.queryByRole('button', { name: 'Show More Starter Actions' })
    ).toBeNull();
    await expectNoA11yViolations(single.container);
  });
});
