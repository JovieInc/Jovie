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

function everyNestedItemHasIcon(items: readonly unknown[]): boolean {
  return items.every(item => {
    if (!item || typeof item !== 'object') {
      return true;
    }

    if ('icon' in item && !item.icon) {
      return false;
    }

    if ('items' in item && Array.isArray(item.items)) {
      return everyNestedItemHasIcon(item.items);
    }

    return true;
  });
}

describe('buildReleaseActions', () => {
  it('promotes copy smart link to top level with grouping separator before it', () => {
    const items = buildReleaseActions({
      release: createRelease(),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
    });

    const separators = items.filter(
      item => 'type' in item && item.type === 'separator'
    );

    expect(items[0]).toMatchObject({
      id: 'edit',
      label: 'Edit release links',
    });
    expect(items[1]).toEqual({ type: 'separator' });
    expect(separators).toHaveLength(1);
    expect(items[2]).toMatchObject({
      id: 'copy-smart-link',
      label: 'Copy smart link',
    });
    const shareMenu = items.find(
      item => 'id' in item && item.id === 'share-link'
    );
    expect(shareMenu).toMatchObject({
      id: 'share-link',
      label: 'Share link',
    });
    const metadataItem = items.find(
      item => 'id' in item && item.id === 'copy-metadata'
    );

    expect(metadataItem).toMatchObject({
      id: 'copy-metadata',
      label: 'Copy metadata',
    });
  });

  it('shows a disabled scheduled smart-link label at top level when locked by schedule', () => {
    const items = buildReleaseActions({
      release: createRelease(),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
      isSmartLinkLocked: () => true,
      getSmartLinkLockReason: () => 'scheduled',
    });

    expect(items[2]).toMatchObject({
      id: 'copy-smart-link',
      label: 'Scheduled smart link (Pro)',
      disabled: true,
    });
    // Share submenu should be omitted entirely when locked (nothing to share)
    const shareMenu = items.find(
      item => 'id' in item && item.id === 'share-link'
    );
    expect(shareMenu).toBeUndefined();
  });

  it('flattens single-provider open action to a top-level item', () => {
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

    const openItem = items.find(
      item => 'id' in item && item.id === 'open-release'
    );

    expect(openItem).toMatchObject({
      id: 'open-release',
      label: 'Open in Spotify',
    });

    // Flattened: should NOT be a submenu
    if (openItem && 'items' in openItem) {
      throw new Error('Expected flattened action, not submenu');
    }
  });

  it('keeps Open in as a submenu when multiple providers are present', () => {
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
          {
            key: 'apple_music',
            label: 'Apple Music',
            url: 'https://music.apple.com/album/123',
            path: '/apple',
            source: 'ingested',
            updatedAt: '2026-01-01T00:00:00.000Z',
            isPrimary: false,
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
        expect.objectContaining({
          id: 'open-apple_music',
          label: 'Open in Apple Music',
        }),
      ])
    );
  });

  it('reuses source icons for tracked share submenu entries', () => {
    const items = buildReleaseActions({
      release: createRelease(),
      onEdit: vi.fn(),
      onCopy: vi.fn(),
    });

    const shareMenu = items.find(
      item => 'id' in item && item.id === 'share-link'
    );
    if (!shareMenu || !('items' in shareMenu)) {
      throw new Error('Expected share submenu');
    }

    const trackedLinksItem = shareMenu.items.find(
      item => 'id' in item && item.id === 'tracked-share-submenu'
    );
    if (!trackedLinksItem || !('items' in trackedLinksItem)) {
      throw new Error('Expected tracked links submenu');
    }

    expect(trackedLinksItem.icon).toBeTruthy();
    expect(everyNestedItemHasIcon(trackedLinksItem.items)).toBe(true);
  });
});
