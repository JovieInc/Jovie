import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatError } from '@/components/jovie/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingMessageRecoveryRow } from './OnboardingMessageRecoveryRow';

function row(chatError: ChatError, handleRetry = vi.fn()) {
  return (
    <OnboardingMessageRecoveryRow
      chatError={chatError}
      handleRetry={handleRetry}
      isBusy={false}
      isSubmitted={false}
    />
  );
}

describe('OnboardingMessageRecoveryRow certificate', () => {
  it('keeps the retryable state axe-clean and retries from the keyboard', async () => {
    const user = userEvent.setup();
    const handleRetry = vi.fn();
    const { container } = render(
      row(
        {
          type: 'server',
          message: 'Something went wrong.',
          failedMessage: 'hi',
        },
        handleRetry
      )
    );

    await expectNoA11yViolations(container);
    screen.getByRole('button', { name: 'Retry message' }).focus();
    await user.keyboard('{Enter}');
    expect(handleRetry).toHaveBeenCalledOnce();
  });

  it('keeps the rate-limited state axe-clean with a signup link', async () => {
    const { container } = render(
      row({ type: 'rate_limit', message: 'Too many requests.', retryAfter: 45 })
    );

    expect(
      screen.getByRole('link', { name: 'Create a free account to keep going' })
    ).toBeVisible();
    expect(screen.getByText(/Try again in/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
