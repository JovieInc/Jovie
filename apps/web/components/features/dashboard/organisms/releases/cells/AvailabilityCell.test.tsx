import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { AvailabilityCell } from './AvailabilityCell';

const release: ReleaseViewModel = {
  profileId: 'profile-1',
  id: 'release-1',
  title: 'Skyline Dreams',
  slug: 'skyline-dreams',
  releaseType: 'single',
  status: 'released',
  isExplicit: false,
  releaseDate: '2026-01-01',
  artworkUrl: undefined,
  totalTracks: 1,
  providers: [
    {
      key: 'spotify',
      url: 'https://open.spotify.com/album/1',
      source: 'ingested',
      updatedAt: '2026-01-01T00:00:00Z',
      label: 'Spotify',
      path: '/spotify/release-1',
      isPrimary: true,
    },
    {
      key: 'apple_music',
      url: 'https://music.apple.com/album/1',
      source: 'manual',
      updatedAt: '2026-01-01T00:00:00Z',
      label: 'Apple Music',
      path: '/apple_music/release-1',
      isPrimary: false,
    },
  ],
  spotifyPopularity: null,
  smartLinkPath: '/smart/release-1',
  previewUrl: null,
  primaryIsrc: null,
  upc: null,
};

const providerConfig = PROVIDER_CONFIG;

function renderCell() {
  return render(
    <AvailabilityCell
      release={release}
      allProviders={['spotify', 'apple_music']}
      providerConfig={providerConfig}
      onCopy={vi.fn().mockResolvedValue('/spotify/release-1')}
    />
  );
}

describe('AvailabilityCell', () => {
  it('names the trigger from its sr-only prefix ahead of the visible rail', () => {
    renderCell();

    const trigger = screen.getByRole('button', {
      name: /Show provider availability details:/,
    });
    // No overriding aria-label: it shadowed the rail's visible count text
    // (WCAG 2.5.3 label-in-name). The sr-only prefix leads the accessible
    // name so it still contains the visible pill content.
    expect(trigger).not.toHaveAttribute('aria-label');
    expect(trigger).toHaveAccessibleName(
      /^Show provider availability details:/
    );
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
});
