import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineOfflineNotice } from './inline-offline';

describe('InlineOfflineNotice', () => {
  it('renders offline status with canonical selector', () => {
    render(<InlineOfflineNotice data-testid='offline-notice' />);

    const notice = screen.getByTestId('offline-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(notice).toHaveAttribute('aria-atomic', 'true');
    expect(notice).toHaveAttribute('data-state', 'offline');
    expect(notice.className).toContain('text-app');
    expect(notice.className).toContain('border-warning/30');
    expect(notice.className).toContain('bg-warning-subtle');
    expect(notice.className).toContain('text-warning');
  });

  it('does not bypass semantic warning tokens with arbitrary state variables', () => {
    render(<InlineOfflineNotice data-testid='offline-notice' />);

    const notice = screen.getByTestId('offline-notice');
    expect(notice.className).not.toMatch(/--state-offline-(border|bg|fg)/);
  });

  it('calls retry handler when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<InlineOfflineNotice onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical secondary retry action contract', () => {
    render(<InlineOfflineNotice onRetry={() => undefined} />);
    const retry = screen.getByRole('button', { name: 'Retry' });

    expect(retry).toHaveAttribute('data-variant', 'secondary');
    expect(retry).toHaveAttribute('data-size', 'sm');
    expect(retry.className).toContain('before:h-11');
  });

  it('supports custom copy and omits the action without a handler', () => {
    render(
      <InlineOfflineNotice
        message='Offline — cached audience data is still available.'
        retryLabel='Try again'
      />
    );

    expect(
      screen.getByText('Offline — cached audience data is still available.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' })
    ).not.toBeInTheDocument();
  });
});
