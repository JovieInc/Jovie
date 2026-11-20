import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InHouseResolution } from './in-house-contracts';

const mocks = vi.hoisted(() => ({
  scheduleAfter: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: () => ({ onConflictDoUpdate: mocks.insert }),
    }),
  },
}));
vi.mock('@/lib/next/schedule-after', () => ({
  scheduleAfter: mocks.scheduleAfter,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/discography/provider-links', () => ({
  lookupSpotifyByIsrc: vi.fn(),
  lookupAppleMusicByIsrc: vi.fn(),
  lookupDeezerByIsrc: vi.fn(),
}));

const {
  buildResolveParityReceipt,
  isSelfEvidencedProvenance,
  scheduleResolveParity,
} = await import('./resolve-parity.server');
const { summarizeShadowParity } = await import('./parity-summary');

const SPOTIFY = 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX';
const APPLE = 'https://music.apple.com/us/album/take-me-over/1?i=2';

function resolution(
  links: InHouseResolution['links'],
  overrides: Partial<InHouseResolution> = {}
): InHouseResolution {
  return {
    status: 'resolved',
    kind: 'track',
    title: 'Take Me Over',
    artist: 'Tim White',
    isrc: 'USRC12345678',
    upc: null,
    mbid: null,
    links,
    candidates: [],
    confidence: 0.92,
    provenance: {},
    candidateCount: 1,
    ...overrides,
  };
}

const lookups = (spotify: string | null, apple: string | null) => ({
  spotify: vi.fn(async () => (spotify ? { url: spotify } : null)),
  apple_music: vi.fn(async () => (apple ? { url: apple } : null)),
  deezer: vi.fn(async () => null),
});

describe('isSelfEvidencedProvenance', () => {
  it('treats identifier and caller-input provenance as self-evidenced', () => {
    for (const p of ['input_url', 'isrc_exact', 'upc_exact', 'spotify_isrc'])
      expect(isSelfEvidencedProvenance(p)).toBe(true);
    for (const p of ['musicbrainz_url_rel', 'exact_name'])
      expect(isSelfEvidencedProvenance(p)).toBe(false);
  });
});

describe('buildResolveParityReceipt', () => {
  it('checks only links not derived from the ISRC itself', async () => {
    const receipt = await buildResolveParityReceipt(
      resolution([
        {
          provider: 'spotify',
          url: SPOTIFY,
          provenance: 'spotify_isrc',
          confidence: 0.92,
        },
        {
          provider: 'apple_music',
          url: APPLE,
          provenance: 'musicbrainz_url_rel',
          confidence: 0.8,
        },
      ]),
      'US',
      lookups(SPOTIFY, APPLE) as never
    );
    expect(receipt?.results?.jovie?.providers).toEqual({ apple_music: APPLE });
    expect(receipt?.results?.reference?.providers).toEqual({
      apple_music: APPLE,
    });
    const summary = summarizeShadowParity([receipt!]);
    expect(summary.falseLinkAlarm.firing).toBe(false);
    expect(summary.organicReceipts).toBe(1);
  });

  it('turns red when a name-matched link disagrees with the provider ISRC lookup', async () => {
    const wrong = 'https://music.apple.com/us/album/other-artist/9?i=9';
    const receipt = await buildResolveParityReceipt(
      resolution([
        {
          provider: 'apple_music',
          url: wrong,
          provenance: 'exact_name',
          confidence: 0.72,
        },
      ]),
      'US',
      lookups(null, APPLE) as never
    );
    const summary = summarizeShadowParity([receipt!]);
    expect(summary.falseLinkAlarm).toMatchObject({
      firing: true,
      candidateFalseLinks: 1,
    });
  });

  it('skips anything that is not a resolved track with an ISRC', async () => {
    const l = lookups(SPOTIFY, APPLE);
    expect(
      await buildResolveParityReceipt(
        resolution([], { isrc: null }),
        'US',
        l as never
      )
    ).toBeNull();
    expect(
      await buildResolveParityReceipt(
        resolution([], { kind: 'album' }),
        'US',
        l as never
      )
    ).toBeNull();
    expect(l.spotify).not.toHaveBeenCalled();
  });
});

describe('scheduleResolveParity', () => {
  beforeEach(() => mocks.scheduleAfter.mockClear());

  it('samples resolved tracks and never blocks the response', () => {
    const resolved = resolution([]);
    expect(scheduleResolveParity(resolved, 'US', () => 0.1)).toBe(true);
    expect(scheduleResolveParity(resolved, 'US', () => 0.9)).toBe(false);
    expect(
      scheduleResolveParity(
        resolution([], { status: 'no_match' }),
        'US',
        () => 0
      )
    ).toBe(false);
    expect(mocks.scheduleAfter).toHaveBeenCalledTimes(1);
  });
});
