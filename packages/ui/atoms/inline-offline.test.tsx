import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InlineOfflineNotice } from './inline-offline';

describe('InlineOfflineNotice', () => {
  it('renders offline status with canonical selector', () => {
    render(<InlineOfflineNotice data-testid='offline-notice' />);

    const notice = screen.getByTestId('offline-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('data-state', 'offline');
    expect(notice.className).toContain('bg-(--state-offline-bg)');
  });

  it('calls retry handler when retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<InlineOfflineNotice onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
