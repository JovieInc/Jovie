import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShareLinkButton } from '@/components/features/share/ShareLinkButton';

function setShare(value: unknown) {
  Object.defineProperty(navigator, 'share', { configurable: true, value });
}

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

describe('ShareLinkButton', () => {
  afterEach(() => {
    setShare(undefined);
  });

  it('opens the native share sheet with the resolved url', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShare(share);
    const onShare = vi.fn();
    render(
      <ShareLinkButton
        title='Tim White'
        getUrl={() => 'https://jov.ie/tim'}
        onShare={onShare}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(onShare).toHaveBeenCalledWith('native'));
    expect(share).toHaveBeenCalledWith({
      title: 'Tim White',
      url: 'https://jov.ie/tim',
    });
  });

  it('copies the link and confirms when the share sheet is unavailable', async () => {
    setShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <ShareLinkButton title='Tim White' getUrl={() => 'https://jov.ie/tim'} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(
      await screen.findByRole('button', { name: 'Link copied' })
    ).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('https://jov.ie/tim');
  });

  it('does nothing visible when the person cancels the share sheet', async () => {
    const abort = Object.assign(new Error('cancelled'), {
      name: 'AbortError',
    });
    setShare(vi.fn().mockRejectedValue(abort));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const onShare = vi.fn();
    render(
      <ShareLinkButton
        title='Tim White'
        getUrl={() => 'https://jov.ie/tim'}
        onShare={onShare}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(onShare).toHaveBeenCalledWith('cancelled'));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('is a 44pt target', () => {
    render(<ShareLinkButton title='x' getUrl={() => 'https://jov.ie/x'} />);
    expect(screen.getByRole('button', { name: 'Share' })).toHaveClass(
      'h-11',
      'w-11'
    );
  });
});
