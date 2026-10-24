import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingSecurityCheckRecovery } from './OnboardingSecurityCheckRecovery';
import type { OnboardingTurnstileStatus } from './OnboardingTurnstile';

describe('OnboardingSecurityCheckRecovery', () => {
  it.each<{ status: OnboardingTurnstileStatus | undefined; message: string }>([
    { status: undefined, message: 'Checking your browser' },
    { status: 'loading', message: 'Checking your browser' },
    { status: 'interactive', message: 'Complete the check below' },
    { status: 'error', message: 'The check couldn’t load' },
    { status: 'unconfigured', message: 'The check couldn’t load' },
    { status: 'expired', message: 'The check timed out' },
    { status: 'timeout', message: 'The check timed out' },
    { status: 'unsupported', message: 'Try allowing security checks' },
  ])(
    'explains $status with draft reassurance and a recovery action',
    ({ status, message }) => {
      render(
        <OnboardingSecurityCheckRecovery
          status={status}
          onRetry={vi.fn()}
          isBusy={false}
        />
      );
      const statusRegion = screen.getByRole('status');
      expect(statusRegion).toHaveTextContent('One quick check');
      expect(statusRegion).toHaveTextContent(message);
      expect(statusRegion).toHaveTextContent('Your draft is still here.');
      expect(statusRegion).toHaveAttribute('aria-live', 'polite');
      expect(screen.queryByText('Message paused')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Try Security Check Again' })
      ).toBeEnabled();
    }
  );

  it('restarts verification from the keyboard and stays disabled during a send', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(
      <OnboardingSecurityCheckRecovery
        status='error'
        onRetry={onRetry}
        isBusy={false}
      />
    );
    await user.tab();
    const retry = screen.getByRole('button', {
      name: 'Try Security Check Again',
    });
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveFocus();

    rerender(
      <OnboardingSecurityCheckRecovery
        status='loading'
        onRetry={onRetry}
        isBusy
      />
    );
    expect(retry).toBeDisabled();
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
