import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferralCodeCopyClient } from '@/app/app/(shell)/settings/referral/ReferralCodeCopyClient';

vi.useFakeTimers();

const mockWriteText = vi.fn().mockResolvedValue(undefined);

Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(0);
  });
};

describe('ReferralCodeCopyClient', () => {
  const defaultProps = {
    shareUrl: 'https://jov.ie/r/ABC123',
    code: 'ABC123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the share URL text', () => {
    render(<ReferralCodeCopyClient {...defaultProps} />);
    expect(screen.getByText('https://jov.ie/r/ABC123')).toBeDefined();
  });

  it('renders a Copy button', () => {
    render(<ReferralCodeCopyClient {...defaultProps} />);
    expect(screen.getByRole('button', { name: /copy/i })).toBeDefined();
  });

  it('calls navigator.clipboard.writeText with the shareUrl on click', async () => {
    render(<ReferralCodeCopyClient {...defaultProps} />);
    const button = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(button);

    await flushPromises();

    expect(mockWriteText).toHaveBeenCalledWith('https://jov.ie/r/ABC123');
  });

  it('shows "Copied" text after clicking', async () => {
    render(<ReferralCodeCopyClient {...defaultProps} />);
    const button = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(button);

    await flushPromises();

    expect(screen.getByText('Copied')).toBeDefined();
  });

  it('reverts back to "Copy" after 2 seconds', async () => {
    render(<ReferralCodeCopyClient {...defaultProps} />);
    const button = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(button);

    await flushPromises();
    expect(screen.getByText('Copied')).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText('Copy')).toBeDefined();
  });
});
