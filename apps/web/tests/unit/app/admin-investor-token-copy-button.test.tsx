import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenCopyButton } from '@/app/app/(shell)/admin/investors/TokenCopyButton';

describe('TokenCopyButton', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('reveals the full token without truncating it to the preview stub', async () => {
    const user = userEvent.setup();

    render(<TokenCopyButton token='tok_live_super_secret_value' />);

    expect(screen.getByText('tok_live...')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Reveal investor token' })
    );

    expect(screen.getByText('tok_live_super_secret_value')).toBeInTheDocument();
  });

  it('copies the full token and shows temporary confirmation feedback', async () => {
    vi.useFakeTimers();

    render(<TokenCopyButton token='tok_live_super_secret_value' />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Full Investor Token' })
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'tok_live_super_secret_value'
    );
    expect(screen.getByTestId('token-copy-success')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.queryByTestId('token-copy-success')).toBeNull();
  });
});
