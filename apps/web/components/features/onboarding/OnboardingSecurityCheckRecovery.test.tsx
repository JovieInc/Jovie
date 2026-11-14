import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    async ({ status, message }) => {
      const { container } = render(
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
      await expectNoA11yViolations(container);
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

  it('places the verification widget between the message and the retry row', async () => {
    const { container } = render(
      <OnboardingSecurityCheckRecovery
        status='interactive'
        onRetry={vi.fn()}
        isBusy={false}
        verification={
          <div data-testid='verification-widget'>
            Verification widget fixture with a long explanation that wraps
            across several lines inside the narrow composer column.
          </div>
        }
      />
    );
    const widget = screen.getByTestId('verification-widget');
    const retry = screen.getByRole('button', {
      name: 'Try Security Check Again',
    });
    expect(
      screen.getByRole('status').compareDocumentPosition(widget) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      widget.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('is axe-clean while a send is in flight', async () => {
    const { container } = render(
      <OnboardingSecurityCheckRecovery
        status='loading'
        onRetry={vi.fn()}
        isBusy
      />
    );
    expect(
      screen.getByRole('button', { name: 'Try Security Check Again' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('keeps the message and retry in a right-to-left composer', async () => {
    const { container } = render(
      <div dir='rtl'>
        <OnboardingSecurityCheckRecovery
          status='timeout'
          onRetry={vi.fn()}
          isBusy={false}
        />
      </div>
    );
    expect(screen.getByRole('status')).toHaveTextContent('The check timed out');
    await expectNoA11yViolations(container);
  });
});
