import { render, screen } from '@testing-library/react';
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
    render(<ChatEmptyStateGreeting firstName='Tim' insight={null} />);

    expect(
      screen.getByTestId('chat-empty-state-greeting-text')
    ).toHaveTextContent('Good morning, Tim.');
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();
  });

  it('renders the insight sentence below the greeting when one is supplied', () => {
    render(
      <ChatEmptyStateGreeting
        firstName='Tim'
        insight='Your streams are up 320% today.'
      />
    );

    expect(screen.getByTestId('chat-empty-state-insight')).toHaveTextContent(
      'Your streams are up 320% today.'
    );
  });

  it('never fabricates an insight: omitted or undefined renders no insight paragraph', () => {
    const { rerender } = render(
      <ChatEmptyStateGreeting firstName='Tim' insight={undefined} />
    );
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();

    rerender(<ChatEmptyStateGreeting firstName='Tim' insight={null} />);
    expect(screen.queryByTestId('chat-empty-state-insight')).toBeNull();
  });

  it('degrades to a plain time-of-day greeting when no first name is available', () => {
    render(<ChatEmptyStateGreeting firstName={null} insight={null} />);

    expect(
      screen.getByTestId('chat-empty-state-greeting-text')
    ).toHaveTextContent('Good morning.');
  });
});
