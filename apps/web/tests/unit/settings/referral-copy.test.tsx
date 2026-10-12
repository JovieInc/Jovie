import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferralCodeCopyClient } from '@/app/app/(shell)/settings/referral/ReferralCodeCopyClient';

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
const url = 'https://jov.ie/signup?ref=artist-code';
const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset();
  Object.assign(navigator, { clipboard: { writeText } });
  document.execCommand = vi.fn().mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

describe('referral link copy recovery', () => {
  it('acknowledges successful clipboard writes', async () => {
    writeText.mockResolvedValue(undefined);
    render(<ReferralCodeCopyClient shareUrl={url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    );
    expect(writeText).toHaveBeenCalledWith(url);
  });
  it('keeps the link visible and permits retry after clipboard denial', async () => {
    writeText
      .mockRejectedValueOnce(new Error('Clipboard denied'))
      .mockResolvedValueOnce(undefined);
    render(<ReferralCodeCopyClient shareUrl={url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    const retry = await screen.findByRole('button', { name: 'Retry copy' });
    expect(screen.getByText(url)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Copied' })
    ).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    );
    expect(writeText).toHaveBeenCalledTimes(2);
  });
  it('keeps the link visible and prevents duplicate copy while the clipboard is pending', async () => {
    let complete!: () => void;
    writeText.mockReturnValue(
      new Promise<void>(resolve => {
        complete = resolve;
      })
    );
    render(<ReferralCodeCopyClient shareUrl={url} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByRole('button', { name: 'Copying…' })).toBeDisabled();
    expect(screen.getByText(url)).toBeInTheDocument();
    complete();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied' })).toBeEnabled()
    );
    expect(writeText).toHaveBeenCalledTimes(1);
  });
});
