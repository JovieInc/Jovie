import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

// axe schedules work on timers, so these fake only the clock.
describe('ChatEmptyStateGreeting states', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T09:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is axe-clean with no next step and keeps the profile review link', async () => {
    const { container } = render(
      <ChatEmptyStateGreeting firstName='Tim' action={null} />
    );
    expect(
      screen.getByRole('link', { name: 'Review Your Profile' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean while the next step loads', async () => {
    const { container } = render(
      <ChatEmptyStateGreeting firstName='Tim' isLoading />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean without a first name', async () => {
    const { container } = render(<ChatEmptyStateGreeting firstName={null} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Good morning.');
    await expectNoA11yViolations(container);
  });

  it('drafts the offered step from the keyboard', async () => {
    const user = userEvent.setup();
    const onSelectAction = vi.fn();
    const { container } = render(
      <ChatEmptyStateGreeting
        firstName='Tim'
        action={{
          insightId: 'release-1',
          expiresAt: Date.parse('2099-01-01T00:00:00Z'),
          suggestion: 'Draft a release update',
          prompt: 'Help me draft a release update.',
        }}
        onSelectAction={onSelectAction}
      />
    );
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Draft This With Jovie' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectAction).toHaveBeenCalledExactlyOnceWith(
      'Help me draft a release update.'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps a long name and suggestion whole', async () => {
    const suggestion =
      'Draft a fan update about the three new cities on the winter run and the limited vinyl pressing';
    const { container } = render(
      <ChatEmptyStateGreeting
        firstName='The Extraordinarily Long Touring Ensemble'
        action={{
          insightId: 'long-1',
          expiresAt: Date.parse('2099-01-01T00:00:00Z'),
          suggestion,
          prompt: 'Help me draft a fan update.',
        }}
        onSelectAction={vi.fn()}
      />
    );
    expect(screen.getByRole('heading')).toHaveTextContent(
      'Good morning, The Extraordinarily Long Touring Ensemble.'
    );
    expect(screen.getByText(suggestion)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean in a right-to-left layout', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatEmptyStateGreeting
          firstName='ليلى'
          action={{
            insightId: 'rtl-1',
            expiresAt: Date.parse('2099-01-01T00:00:00Z'),
            suggestion: 'اكتب تحديثًا للمعجبين',
            prompt: 'Help me draft a fan update.',
          }}
          onSelectAction={vi.fn()}
        />
      </div>
    );
    expect(screen.getByRole('heading')).toHaveTextContent('ليلى');
    await expectNoA11yViolations(container);
  });
});
