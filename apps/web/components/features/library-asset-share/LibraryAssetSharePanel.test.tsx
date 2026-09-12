import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryReleaseAsset } from '@/app/app/(shell)/library/library-data';
import { LibraryAssetSharePanel } from './LibraryAssetSharePanel';

const asset = {
  id: 'release-1',
  title: 'Take Me Over',
} as LibraryReleaseAsset;

describe('LibraryAssetSharePanel', () => {
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
});
