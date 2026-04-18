import { describe, expect, it, vi } from 'vitest';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/components/atoms/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/lib/utils/platform-detection', () => ({
  getBaseUrl: () => 'https://jov.ie',
}));

vi.mock('@/lib/utm', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/utm')>();

  return {
    ...actual,
    buildUTMContext: () => ({}),
    getUTMShareContextMenuItems: () => [
      {
        id: 'utm-share-submenu',
        label: 'Copy with UTM',
        items: [],
      },
    ],
  };
});

function createRelease(
  overrides: Partial<ReleaseViewModel> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile-1',
    id: 'release-1',
    title: 'Skyline Dreams',
    slug: 'skyline-dreams',
    releaseType: 'single',
    isExplicit: false,
    releaseDate: '2026-06-15',
    artworkUrl: undefined,
    totalTracks: 1,
    providers: [],
    spotifyPopularity: null,
    smartLinkPath: '/smart/release-1',
    previewUrl: null,
    primaryIsrc: 'USRC17607839',
    upc: '123456789012',
    ...overrides,
  };
}

describe('buildReleaseActions', () => {
  it('keeps edit separate from copy/share actions', () => {
    const items = buildReleaseActions({
      release: createRelease(),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
    });

    expect(items[0]).toMatchObject({
      id: 'edit',
      label: 'Edit release links',
    });
    expect(items[1]).toEqual({ type: 'separator' });
    expect(items[2]).toMatchObject({
      id: 'share-link',
      label: 'Share link',
    });
    if (!('items' in items[2])) {
      throw new Error('Expected share submenu');
    }
    expect(items[2].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'copy-smart-link',
          label: 'Copy smart link',
        }),
      ])
    );
    expect(items[4]).toMatchObject({
      id: 'copy-metadata',
      label: 'Copy metadata',
    });
  });

  it('shows a disabled scheduled smart-link label when locked by schedule', () => {
    const items = buildReleaseActions({
      release: createRelease(),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
      isSmartLinkLocked: () => true,
      getSmartLinkLockReason: () => 'scheduled',
    });

    expect(items[2]).toMatchObject({
      id: 'share-link',
      label: 'Share link',
    });
    if (!('items' in items[2])) {
      throw new Error('Expected share submenu');
    }
    expect(items[2].items[0]).toMatchObject({
      id: 'copy-smart-link',
      label: 'Scheduled smart link (Pro)',
      disabled: true,
    });
  });

  it('includes external provider actions when provider urls are present', () => {
    const items = buildReleaseActions({
      release: createRelease({
        providers: [
          {
            key: 'spotify',
            label: 'Spotify',
            url: 'https://open.spotify.com/album/123',
            path: '/spotify',
            source: 'ingested',
            updatedAt: '2026-01-01T00:00:00.000Z',
            isPrimary: true,
          },
        ],
      }),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
    });

    const openMenu = items.find(
      item => 'id' in item && item.id === 'open-release'
    );

    expect(openMenu).toMatchObject({
      id: 'open-release',
      label: 'Open in',
    });

    if (!openMenu || !('items' in openMenu)) {
      throw new Error('Expected open submenu');
    }

    expect(openMenu.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'open-spotify',
          label: 'Open in Spotify',
        }),
      ])
    );
  });
});
