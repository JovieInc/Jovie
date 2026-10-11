import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const inserted = vi.hoisted(() => ({
  value: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserted.value = value;
        return {
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: 'jovie-discovery-job' }]),
          })),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
      })),
    })),
  },
}));

import { enqueueMusicFetchEnrichmentJob } from './jobs';

describe('MusicFetch enqueue cutover', () => {
  afterEach(() => {
    inserted.value = null;
    delete process.env.FEATURE_MUSICFETCH_FALLBACK;
    delete process.env.FEATURE_MUSIC_RESOLVER_PROVIDER_LINKS;
    delete process.env.FEATURE_MUSIC_RESOLVER_RELEASE_FACTS;
  });

  it('routes vendor-off refreshes to Jovie DSP discovery', async () => {
    process.env.FEATURE_MUSICFETCH_FALLBACK = 'false';
    process.env.FEATURE_MUSIC_RESOLVER_PROVIDER_LINKS = 'true';
    process.env.FEATURE_MUSIC_RESOLVER_RELEASE_FACTS = 'true';

    await expect(
      enqueueMusicFetchEnrichmentJob({
        creatorProfileId: '6c3e5c0a-2b2a-4c1a-9c1a-0b0b0b0b0b0b',
        spotifyUrl: 'https://open.spotify.com/artist/6M2wZ9GZgrQXHCFfjv46we',
      })
    ).resolves.toBe('jovie-discovery-job');

    expect(inserted.value).toMatchObject({
      jobType: 'dsp_artist_discovery',
      payload: {
        creatorProfileId: '6c3e5c0a-2b2a-4c1a-9c1a-0b0b0b0b0b0b',
        spotifyArtistId: '6M2wZ9GZgrQXHCFfjv46we',
      },
    });
  });
});
