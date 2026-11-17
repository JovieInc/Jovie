import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileAboutShare } from './ProfileAboutShare';

function setNavigatorShare(share: unknown) {
  Object.defineProperty(navigator, 'share', {
    value: share,
    configurable: true,
  });
}

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  setNavigatorShare(undefined);
  vi.restoreAllMocks();
});

describe('ProfileAboutShare', () => {
  it('shares through the native sheet and confirms with a copied label', async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(share);
    const { container } = render(
      <ProfileAboutShare url='https://jov.ie/timwhite' artistName='Tim White' />
    );

    const button = screen.getByRole('button', {
      name: "Share Tim White's profile",
    });
    expect(button).toHaveAttribute('type', 'button');
    await expectNoA11yViolations(container);

    await user.click(button);

    expect(share).toHaveBeenCalledWith({
      title: 'Tim White',
      url: 'https://jov.ie/timwhite',
    });
    expect(
      await screen.findByRole('button', {
        name: "Copied link to Tim White's profile",
      })
    ).toBeVisible();
    expect(screen.getByText('Link Copied')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('copies the link when the share sheet is unavailable, then resets', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <ProfileAboutShare url='https://jov.ie/timwhite' artistName='Tim White' />
    );

    await user.click(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    );
    expect(writeText).toHaveBeenCalledWith('https://jov.ie/timwhite');
    expect(
      screen.getByRole('button', { name: "Copied link to Tim White's profile" })
    ).toBeVisible();

    expect(
      await screen.findByRole(
        'button',
        { name: "Share Tim White's profile" },
        { timeout: 3000 }
      )
    ).toBeVisible();
  });

  it('does nothing when the visitor cancels the share sheet', async () => {
    const user = userEvent.setup();
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    setNavigatorShare(vi.fn().mockRejectedValue(abort));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <ProfileAboutShare url='https://jov.ie/timwhite' artistName='Tim White' />
    );

    await user.click(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    );

    expect(writeText).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    ).toBeVisible();
  });

  it('falls back to the clipboard when sharing fails for another reason', async () => {
    const user = userEvent.setup();
    setNavigatorShare(vi.fn().mockRejectedValue(new Error('blocked')));
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(
      <ProfileAboutShare url='https://jov.ie/timwhite' artistName='Tim White' />
    );

    await user.click(
      screen.getByRole('button', { name: "Share Tim White's profile" })
    );

    expect(writeText).toHaveBeenCalledWith('https://jov.ie/timwhite');
    expect(
      await screen.findByRole('button', {
        name: "Copied link to Tim White's profile",
      })
    ).toBeVisible();
  });

  it('keeps a right-to-left artist name axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileAboutShare
          url='https://jov.ie/midnight'
          artistName='فرقة منتصف الليل'
        />
      </div>
    );

    expect(
      screen.getByRole('button', { name: "Share فرقة منتصف الليل's profile" })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
