import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { toast } from '@/components/feedback';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
} as LibraryReleaseAsset;

const privateShare = {
  assetId: asset.id,
  visibility: 'private',
  shareSlug: 'take-me-over',
  accessToken: 'token-1',
  shareUrl: 'https://jov.ie/p/token-1',
  tokenRevokedAt: null,
} satisfies LibraryAssetShareViewModel;

describe('LibraryAssetSharePanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps Share Link to URL, Copy, and overflow verbs', async () => {
    const user = userEvent.setup();

    render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={{
          assetId: 'release-1',
          visibility: 'private',
          shareSlug: 'take-me-over',
          accessToken: 'token-1',
          shareUrl: 'https://jov.ie/p/token-1',
          tokenRevokedAt: null,
        }}
        onShareChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/p/token-1'
    );
    expect(
      screen.getByRole('button', { name: 'Copy to clipboard' })
    ).toBeVisible();
    expect(screen.queryByText('Public Link')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Revoke private link' })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Share link actions for Take Me Over',
      })
    );

    expect(
      screen.getByRole('menuitem', { name: 'Make public' })
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Revoke private link' })
    ).toBeInTheDocument();
  });

  it('folds private file sharing into the link row overflow', async () => {
    const user = userEvent.setup();
    const onSharePrivately = vi.fn();

    render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={{
          assetId: 'release-1',
          visibility: 'public',
          shareSlug: 'take-me-over',
          accessToken: 'token-1',
          shareUrl: 'https://jov.ie/p/token-1',
          tokenRevokedAt: null,
        }}
        onShareChange={vi.fn()}
        onSharePrivately={onSharePrivately}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Share link actions for Take Me Over',
      })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Share Files Privately' })
    );
    expect(onSharePrivately).toHaveBeenCalledTimes(1);
  });

  it('generates a missing link and publishes the returned share', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ share: privateShare }));
    vi.stubGlobal('fetch', fetchMock);
    const onShareChange = vi.fn();

    render(
      <LibraryAssetSharePanel
        asset={asset}
        profileId='profile-1'
        artistHandle='tim'
        disabled={false}
        initialShare={null}
        onShareChange={onShareChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('URL To Copy')).toHaveValue(
        'jov.ie/p/token-1'
      );
    });
    expect(onShareChange).toHaveBeenCalledWith(asset.id, privateShare);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/library/asset-share',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      profileId: 'profile-1',
      assetId: asset.id,
    });
  });

  it.each([
    {
      action: 'Make public',
      endpoint: '/api/library/asset-share',
      method: 'PATCH',
      nextShare: {
        ...privateShare,
        visibility: 'public',
        shareUrl: 'https://jov.ie/a/tim/take-me-over',
      } satisfies LibraryAssetShareViewModel,
    },
    {
      action: 'Revoke private link',
      endpoint: '/api/library/asset-share/revoke',
      method: 'POST',
      nextShare: {
        ...privateShare,
        accessToken: 'token-2',
        shareUrl: 'https://jov.ie/p/token-2',
      },
    },
  ])(
    'applies the server result for $action',
    async ({ action, endpoint, method, nextShare }) => {
      const user = userEvent.setup();
      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json({ share: nextShare }));
      vi.stubGlobal('fetch', fetchMock);
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
      await user.click(await screen.findByRole('menuitem', { name: action }));

      await waitFor(() => {
        expect(screen.getByLabelText('URL To Copy')).toHaveValue(
          nextShare.shareUrl.replace('https://', '')
        );
      });
      expect(onShareChange).toHaveBeenCalledExactlyOnceWith(
        asset.id,
        nextShare
      );
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        endpoint,
        expect.objectContaining({ method })
      );
      if (method === 'PATCH') {
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
          visibility: 'public',
        });
      }
    }
  );

  it('preserves the private link when the visibility mutation fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
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
    await user.click(
      await screen.findByRole('menuitem', { name: 'Make public' })
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to change share visibility right now'
      );
    });
    expect(screen.getByLabelText('URL To Copy')).toHaveValue(
      'jov.ie/p/token-1'
    );
    expect(onShareChange).not.toHaveBeenCalled();
  });
});
