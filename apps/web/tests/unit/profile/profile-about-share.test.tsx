import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfileAboutShare } from '@/features/profile/ProfileAboutShare';

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('ProfileAboutShare', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
  });

  it('copies the profile URL when the Web Share API is unavailable', async () => {
    const writeText = mockClipboard();

    render(
      <ProfileAboutShare url='https://jov.ie/dj-test' artistName='DJ Test' />
    );

    const button = screen.getByTestId('profile-about-share');
    expect(button).toHaveAttribute('aria-label', "Share DJ Test's profile");

    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('https://jov.ie/dj-test');
      expect(button).toHaveAttribute(
        'aria-label',
        "Copied link to DJ Test's profile"
      );
    });
  });

  it('uses the Web Share API when available', async () => {
    const writeText = mockClipboard();
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    });

    render(
      <ProfileAboutShare url='https://jov.ie/dj-test' artistName='DJ Test' />
    );

    fireEvent.click(screen.getByTestId('profile-about-share'));

    await vi.waitFor(() => {
      expect(share).toHaveBeenCalledWith({
        title: 'DJ Test',
        url: 'https://jov.ie/dj-test',
      });
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does nothing when the user cancels the share sheet', async () => {
    const writeText = mockClipboard();
    const share = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('cancelled'), { name: 'AbortError' })
      );
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    });

    render(
      <ProfileAboutShare url='https://jov.ie/dj-test' artistName='DJ Test' />
    );

    const button = screen.getByTestId('profile-about-share');
    fireEvent.click(button);

    await vi.waitFor(() => {
      expect(share).toHaveBeenCalled();
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-label', "Share DJ Test's profile");
  });
});
