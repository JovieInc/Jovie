import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const asset = { id: 'release-1', title: 'Take Me Over' } as LibraryReleaseAsset;

const privateShare = {
  assetId: asset.id,
  visibility: 'private',
  shareSlug: 'take-me-over',
  accessToken: 'token-1',
  shareUrl: 'https://jov.ie/p/token-1',
  tokenRevokedAt: null,
} satisfies LibraryAssetShareViewModel;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('LibraryAssetSharePanel certificate', () => {
  it('shows the placeholder and requests nothing without a profile', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId={null}
        artistHandle={null}
        disabled={false}
        initialShare={null}
        onShareChange={vi.fn()}
      />
    );

    expect(
      screen.getByTestId('library-asset-share-url-release-1')
    ).toHaveTextContent('Generating link...');
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('reports a failed link request once and keeps the placeholder', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const onShareChange = vi.fn();
    const { container } = render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={null}
        onShareChange={onShareChange}
      />
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to load share link right now'
      )
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onShareChange).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('library-asset-share-url-release-1')
    ).toHaveTextContent('Generating link...');
    await expectNoA11yViolations(container);
  });

  it('holds the visibility actions when the profile context is missing', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId={null}
        artistHandle='tim'
        disabled={false}
        initialShare={privateShare}
        onShareChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Share link actions for Take Me Over',
      })
    );
    expect(
      screen.getByRole('menuitem', { name: 'Make public' })
    ).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByRole('menuitem', { name: 'Revoke private link' })
    ).toHaveAttribute('aria-disabled', 'true');
    await expectNoA11yViolations(container);
  });

  it('toasts when changing visibility fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );
    const onShareChange = vi.fn();
    render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={privateShare}
        onShareChange={onShareChange}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Share link actions for Take Me Over',
      })
    );
    await user.click(screen.getByRole('menuitem', { name: 'Make public' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to change share visibility right now'
      )
    );
    expect(onShareChange).not.toHaveBeenCalled();
  });

  it('keeps a long title and URL, and an Arabic title, axe-clean', async () => {
    const longTitle =
      'Take Me Over (Extended Sunrise Mix featuring the Whole Band, Live from the Rooftop)';
    const { container, rerender } = render(
      <LibraryAssetSharePanel
        asset={{ ...asset, title: longTitle }}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={{
          ...privateShare,
          shareUrl: 'https://jov.ie/p/token-1-for-the-extended-sunrise-mix',
        }}
        onShareChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', {
        name: `Share link actions for ${longTitle}`,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('library-asset-share-url-release-1')
    ).toHaveTextContent('jov.ie/p/token-1-for-the-extended-sunrise-mix');
    await expectNoA11yViolations(container);

    rerender(
      <div dir='rtl' lang='ar'>
        <LibraryAssetSharePanel
          asset={{ ...asset, title: 'خذني' }}
          profileId='profile-1'
          artistHandle='tim'
          disabled={false}
          initialShare={privateShare}
          onShareChange={vi.fn()}
        />
      </div>
    );
    expect(
      screen.getByRole('button', { name: 'Share link actions for خذني' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
