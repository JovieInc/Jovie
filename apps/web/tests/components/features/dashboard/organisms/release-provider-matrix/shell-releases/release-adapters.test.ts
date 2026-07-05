import { describe, expect, it } from 'vitest';
import { releaseToDspItems } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/release-adapters';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { DSP_CONFIGS } from '@/lib/dsp-registry';

const MAJOR_KEYS = ['spotify', 'apple_music', 'youtube_music', 'tidal'];

function fakeProvider(key: string, label: string) {
  return {
    key,
    label,
    url: `https://example.invalid/${key}`,
    source: 'ingested',
    updatedAt: '2026-01-01T00:00:00.000Z',
    confidence: 'confirmed',
    path: `/r/${key}`,
    isPrimary: false,
  };
}

function fakeRelease(
  providers: Array<ReturnType<typeof fakeProvider>>
): ReleaseViewModel {
  return {
    profileId: 'p',
    id: 'r1',
    title: 'Lost in the Light',
    artistNames: ['Bahamas'],
    status: 'released',
    slug: 'lost-in-the-light',
    smartLinkPath: '/lost-in-the-light',
    providers,
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
  } as unknown as ReleaseViewModel;
}

describe('releaseToDspItems', () => {
  it('anchors the four major DSPs as missing when the release has no links', () => {
    const items = releaseToDspItems(fakeRelease([]));

    expect(items.map(item => item.id)).toEqual(MAJOR_KEYS);
    expect(items.every(item => item.status === 'missing')).toBe(true);
  });

  it('marks a major DSP live when the release has its link', () => {
    const items = releaseToDspItems(
      fakeRelease([fakeProvider('spotify', 'Spotify')])
    );

    const spotify = items.find(item => item.id === 'spotify');
    expect(spotify?.status).toBe('live');
    expect(items.filter(item => item.status === 'live')).toHaveLength(1);
  });

  it('appends every non-major provider as a live item instead of capping at the majors', () => {
    const items = releaseToDspItems(
      fakeRelease([
        fakeProvider('spotify', 'Spotify'),
        fakeProvider('deezer', 'Deezer'),
        fakeProvider('amazon_music', 'Amazon Music'),
        fakeProvider('soundcloud', 'SoundCloud'),
      ])
    );

    // 4 anchored majors + 3 non-major live providers, no duplicates.
    expect(items).toHaveLength(7);
    expect(items.map(item => item.id)).toEqual([
      ...MAJOR_KEYS,
      'deezer',
      'amazon_music',
      'soundcloud',
    ]);

    const deezer = items.find(item => item.id === 'deezer');
    expect(deezer?.status).toBe('live');
    expect(deezer?.color).toBe(DSP_CONFIGS.deezer.color);
    expect(deezer?.glyph).toBe('D');
  });

  it('falls back to PROVIDER_CONFIG accents for providers missing from the DSP registry', () => {
    const items = releaseToDspItems(
      fakeRelease([fakeProvider('yandex', 'Yandex Music')])
    );

    const yandex = items.find(item => item.id === 'yandex');
    expect(yandex?.status).toBe('live');
    expect(yandex?.color).toBe(PROVIDER_CONFIG.yandex.accent);
    expect(yandex?.label).toBe('Yandex Music');
  });
});
