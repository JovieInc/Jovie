import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatError } from '@/components/jovie/types';
import { OnboardingMessageRecoveryRow } from './OnboardingMessageRecoveryRow';

const noop = () => {};

function makeChatError(overrides: Partial<ChatError> = {}): ChatError {
  return {
    type: 'server',
    message: 'Something went wrong.',
    ...overrides,
  };
}

describe('OnboardingMessageRecoveryRow', () => {
  it('renders the paused heading, the server reason, and both assertions roles', () => {
    render(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError()}
        handleRetry={noop}
        isBusy={false}
        isSubmitted={false}
      />
    );

    const row = screen.getByTestId('onboarding-message-recovery');
    expect(row).toHaveAttribute('role', 'alert');
    expect(row).toHaveAttribute('aria-live', 'assertive');
    expect(row).toHaveAttribute('aria-atomic', 'true');
    expect(screen.getByText('Message paused')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('offers a retry only when there is a failed message and no retryAfter', async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();
    const { rerender } = render(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({ failedMessage: 'hello' })}
        handleRetry={handleRetry}
        isBusy={false}
        isSubmitted={false}
      />
    );

    const retry = screen.getByRole('button', { name: 'Retry message' });
    expect(retry).toBeEnabled();
    await user.click(retry);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    rerender(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({ retryAfter: 30 })}
        handleRetry={handleRetry}
        isBusy={false}
        isSubmitted={false}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Retry message' })
    ).not.toBeInTheDocument();
  });

  it('disables the retry while busy or already submitted', () => {
    const { rerender } = render(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({ failedMessage: 'hello' })}
        handleRetry={noop}
        isBusy
        isSubmitted={false}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Retry message' })
    ).toBeDisabled();

    rerender(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({ failedMessage: 'hello' })}
        handleRetry={noop}
        isBusy={false}
        isSubmitted
      />
    );
    expect(
      screen.getByRole('button', { name: 'Retry message' })
    ).toBeDisabled();
  });

  it('shows the wait time and a signup link for rate-limit denials instead of a retry', () => {
    render(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({
          type: 'rate_limit',
          message: 'Too many anonymous chat requests from this IP.',
          retryAfter: 45,
        })}
        handleRetry={noop}
        isBusy={false}
        isSubmitted={false}
      />
    );

    expect(
      screen.getByText('Too many anonymous chat requests from this IP.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^Try again in /)).toBeInTheDocument();
    const signup = screen.getByRole('link', {
      name: 'Create a free account to keep going',
    });
    expect(signup).toHaveAttribute('href', '/signup');
    expect(
      screen.queryByRole('button', { name: 'Retry message' })
    ).not.toBeInTheDocument();
  });

  it('counts down to a fixed deadline instead of restarting the wait on every render', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const chatError = makeChatError({
        type: 'rate_limit',
        message: 'Too many anonymous chat requests from this IP.',
        retryAfter: 90,
      });
      const { rerender } = render(
        <OnboardingMessageRecoveryRow
          chatError={chatError}
          handleRetry={noop}
          isBusy={false}
          isSubmitted={false}
        />
      );

      // Deadline captured at first render: 90s out → "2 minutes" (ceil).
      expect(screen.getByText('Try again in 2 minutes.')).toBeInTheDocument();

      // 30 seconds pass and the parent re-renders (e.g. a streaming tick).
      vi.setSystemTime(new Date('2026-01-01T00:00:30Z'));
      rerender(
        <OnboardingMessageRecoveryRow
          chatError={chatError}
          handleRetry={noop}
          isBusy={false}
          isSubmitted={false}
        />
      );

      // The wait label must reflect the elapsed time (60s left → 1 minute),
      // NOT restart from the full duration.
      expect(screen.getByText('Try again in 1 minute.')).toBeInTheDocument();

      // After the deadline passes, the label reports "now".
      vi.setSystemTime(new Date('2026-01-01T00:01:31Z'));
      rerender(
        <OnboardingMessageRecoveryRow
          chatError={chatError}
          handleRetry={noop}
          isBusy={false}
          isSubmitted={false}
        />
      );
      expect(screen.getByText('Try again in now.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('omits the signup link for non-rate-limit errors', () => {
    render(
      <OnboardingMessageRecoveryRow
        chatError={makeChatError({ type: 'network' })}
        handleRetry={noop}
        isBusy={false}
        isSubmitted={false}
      />
    );

    expect(
      screen.queryByRole('link', {
        name: 'Create a free account to keep going',
      })
    ).not.toBeInTheDocument();
  });
});
