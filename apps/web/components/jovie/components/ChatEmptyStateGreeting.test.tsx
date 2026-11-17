import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { ChatEmptyStateResult } from '../chat-empty-greeting';
import { ChatEmptyStateGreeting } from './ChatEmptyStateGreeting';

const draft: ChatEmptyStateResult = {
  id: 'draft-1',
  item: { kind: 'release', id: 'release-9', label: 'Wheels Up' },
  result: {
    kind: 'draft',
    summary: 'Your playlist pitch for Wheels Up is ready.',
    href: '/app/chat/thread-1',
  },
};

describe('ChatEmptyStateGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows only the greeting when Jovie has nothing finished', () => {
    render(<ChatEmptyStateGreeting firstName='Tim' />);

    expect(
      screen.getByTestId('chat-empty-state-greeting-text')
    ).toHaveTextContent('Good morning, Tim.');
    expect(screen.queryByTestId('chat-empty-state-result')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a finished draft with one link that opens it', () => {
    render(<ChatEmptyStateGreeting firstName='Tim' result={draft} />);

    const region = screen.getByTestId('chat-empty-state-result');
    expect(region).toHaveAttribute('data-result-id', 'draft-1');
    expect(region).toHaveTextContent(
      'Your playlist pitch for Wheels Up is ready.'
    );
    const link = screen.getByRole('link', { name: 'Review Draft' });
    expect(link).toHaveAttribute('href', '/app/chat/thread-1');
  });

  it('reaches the result link from the keyboard', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ChatEmptyStateGreeting firstName='Tim' result={draft} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Review Draft' })).toHaveFocus();
  });

  it('never shows the Nov 14 chore suggestion or its Draft This With Jovie button', () => {
    render(
      <ChatEmptyStateGreeting
        firstName='Tim'
        result={{
          ...draft,
          result: {
            ...draft.result,
            summary: 'Review your tip flow with Jovie',
          },
        }}
      />
    );

    expect(screen.queryByTestId('chat-empty-state-result')).toBeNull();
    expect(screen.queryByText('Review your tip flow with Jovie')).toBeNull();
    expect(screen.queryByText(/Draft This With Jovie/i)).toBeNull();
  });

  it('has no accessibility violations with a result', async () => {
    vi.useRealTimers();
    const { container } = render(
      <ChatEmptyStateGreeting firstName='Tim' result={draft} />
    );
    await expectNoA11yViolations(container);
  });
});
