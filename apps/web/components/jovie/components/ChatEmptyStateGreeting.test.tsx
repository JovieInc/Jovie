import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatEmptyStateGreeting } from './ChatEmptyStateGreeting';

describe('ChatEmptyStateGreeting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the time-of-day greeting with the first name and no insight paragraph', () => {
    render(<ChatEmptyStateGreeting firstName='Tim' />);

    expect(
      screen.getByTestId('chat-empty-state-greeting-text')
    ).toHaveTextContent('Good morning, Tim.');
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();
  });

  it('keeps the personal welcome and offers exactly one contextual draft (JOV-7150)', () => {
    const onSelectAction = vi.fn();
    render(
      <ChatEmptyStateGreeting
        firstName='Tim'
        action={{
          insightId: 'tip-1',
          expiresAt: Date.parse('2026-10-15T00:00:00Z'),
          suggestion: 'Review your tip flow with Jovie',
          prompt:
            'Review my tip flow. Insight tip-1: 27 tip link clicks, zero tips completed',
        }}
        onSelectAction={onSelectAction}
      />
    );

    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getByRole('heading')).toHaveTextContent('Good morning, Tim.');
    expect(
      screen.queryByText('27 tip link clicks, zero tips completed')
    ).toBeNull();
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Draft This With Jovie' })
    );
    expect(onSelectAction).toHaveBeenCalledExactlyOnceWith(
      'Review my tip flow. Insight tip-1: 27 tip link clicks, zero tips completed'
    );
  });

  it('never fabricates an insight: omitted or undefined renders no insight paragraph', () => {
    const { rerender } = render(<ChatEmptyStateGreeting firstName='Tim' />);
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();

    expect(
      screen.getByRole('link', { name: 'Review Your Profile' })
    ).toHaveAttribute('href', '/app/chat?panel=profile');
    rerender(<ChatEmptyStateGreeting firstName='Tim' action={null} />);
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();
  });

  it('degrades to a plain time-of-day greeting when no first name is available', () => {
    render(<ChatEmptyStateGreeting firstName={null} />);

    expect(
      screen.getByTestId('chat-empty-state-greeting-text')
    ).toHaveTextContent('Good morning.');
  });

  it('keeps the greeting while loading without an inert action', () => {
    render(<ChatEmptyStateGreeting firstName='Tim' isLoading />);
    expect(screen.getByRole('heading')).toHaveTextContent('Good morning, Tim.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Finding your next step'
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
