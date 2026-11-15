import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryAssetShareUrlCell } from './LibraryAssetShareUrlCell';

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
} as LibraryReleaseAsset;

const share = {
  assetId: asset.id,
  visibility: 'private',
  shareSlug: 'take-me-over',
  accessToken: 'token-1',
  shareUrl: 'https://jov.ie/p/token-1',
  tokenRevokedAt: null,
} satisfies LibraryAssetShareViewModel;

describe('LibraryAssetShareUrlCell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the share URL without its scheme and copies the full URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const onRowClick = vi.fn();
    const { container } = render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: test stand-in for the table row click
      // biome-ignore lint/a11y/noStaticElementInteractions: test stand-in for the table row click
      <div onClick={onRowClick}>
        <LibraryAssetShareUrlCell asset={asset} share={share} />
      </div>
    );

    expect(screen.getByText('jov.ie/p/token-1')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy share URL for Take Me Over' })
    );

    expect(writeText).toHaveBeenCalledWith('https://jov.ie/p/token-1');
    expect(onRowClick).not.toHaveBeenCalled();
    const copied = screen.getByRole('button', { name: 'Copied share URL' });
    expect(copied.querySelector('svg')).toHaveClass('text-success');
    expect(copied.querySelector('svg')?.getAttribute('class')).not.toMatch(
      /emerald/
    );
    await expectNoA11yViolations(container);

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(
      screen.getByRole('button', { name: 'Copy share URL for Take Me Over' })
    ).toBeVisible();
  });

  it('keeps the idle copy label when the clipboard write fails', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));
    render(<LibraryAssetShareUrlCell asset={asset} share={share} />);

    await user.click(
      screen.getByRole('button', { name: 'Copy share URL for Take Me Over' })
    );

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Copy share URL for Take Me Over' })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Copied share URL' })).toBe(
      null
    );
  });

  it('shows a dash and a disabled copy button when there is no share', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    const { container } = render(
      <LibraryAssetShareUrlCell asset={asset} share={null} />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: 'Copy share URL for Take Me Over',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('opacity-40');
    await user.click(button);
    expect(writeText).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('truncates a long URL and stays axe-clean right to left', async () => {
    const longUrl = `https://jov.ie/p/${'midnight-drive-extended-'.repeat(6)}token`;
    const { container } = render(
      <div dir='rtl' lang='ar' className='w-48'>
        <LibraryAssetShareUrlCell
          asset={{ ...asset, title: 'منتصف الليل' }}
          share={{ ...share, shareUrl: longUrl }}
        />
      </div>
    );

    const text = screen.getByText(longUrl.replace('https://', ''));
    expect(text).toHaveClass('truncate');
    expect(
      screen.getByRole('button', { name: 'Copy share URL for منتصف الليل' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
