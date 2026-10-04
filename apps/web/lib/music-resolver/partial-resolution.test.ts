import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const defaults = vi.hoisted(() => vi.fn());
vi.mock('./in-house-sources', () => ({
  createDefaultInHouseSources: defaults,
}));

import { CallerCancellationError } from '@/lib/resilience/caller-cancellation';
import { type InHouseSources, resolveInHouse } from './in-house';
import { musicResolveOutputSchema, resolvePublicMusic } from './public-read';

const track = {
  provider: 'apple_music',
  title: 'Signal Fire',
  artist: 'The Artist',
  url: 'https://music.apple.com/us/album/123?i=456',
  isrc: 'USRC17607839',
  upc: null,
  provenance: 'input_url',
  confidence: 0.95,
};
const relation = {
  provider: 'youtube',
  url: 'https://www.youtube.com/watch?v=LtDL1HHq954',
  provenance: 'musicbrainz_url_rel',
  confidence: 0.8,
};
const failure = new Error('Private upstream response must not be exposed');
const diagnostic = (source: string) => ({
  source,
  code: 'UPSTREAM_FAILURE',
  retryable: true,
});
function sources(overrides: Partial<InHouseSources> = {}): InHouseSources {
  return {
    trackByIsrc: async () => [],
    trackByUrl: async () => track,
    searchTracks: async () => [track],
    albumByUpc: async () => null,
    albumByUrl: async () => null,
    searchAlbums: async () => [],
    artistCandidates: async () => [],
    artistByUrl: async () => [],
    artistByMbid: async () => null,
    urlRelsForIsrc: async () => [],
    ...overrides,
  };
}
const rejected = async () => {
  throw failure;
};

describe('partial track resolution', () => {
  it.each([false, true])(
    'keeps failed-lookup diagnostics in the public error (transient: %s)',
    async transient => {
      defaults.mockReturnValue(
        sources({
          trackByIsrc: async () => {
            throw { statusCode: 401 };
          },
          ...(transient
            ? {
                urlRelsForIsrc: async () => {
                  throw { errorCode: 'TIMEOUT' };
                },
              }
            : {}),
        })
      );
      const result = await resolvePublicMusic({
        kind: 'track',
        input: track.isrc,
      });
      expect(result).toEqual({
        error: {
          code: 'UPSTREAM_FAILURE',
          retryable: transient,
          sourceErrors: [
            { source: 'catalog_isrc', code: 'UNAUTHORIZED', retryable: false },
            ...(transient
              ? [
                  {
                    source: 'musicbrainz_isrc',
                    code: 'TIMEOUT',
                    retryable: true,
                  },
                ]
              : []),
          ],
        },
      });
    }
  );

  it.each([
    [{ statusCode: 401 }, 'UNAUTHORIZED', false],
    [{ status: 403 }, 'UNAUTHORIZED', false],
    [{ code: 'SPOTIFY_NOT_CONNECTED' }, 'UNAUTHORIZED', false],
    [{ statusCode: 400 }, 'UPSTREAM_FAILURE', false],
    [{ code: 'SPOTIFY_RATE_LIMITED', retryAfter: 17 }, 'RATE_LIMITED', true],
    [{ statusCode: 429, retryAfter: 0 }, 'RATE_LIMITED', true],
    [{ errorCode: 'TIMEOUT' }, 'TIMEOUT', true],
    [{ name: 'TimeoutError' }, 'TIMEOUT', true],
    [
      { errorCode: 'INVALID_RESPONSE', retryable: true },
      'INVALID_RESPONSE',
      false,
    ],
    [{ code: 'UNSUPPORTED' }, 'UNSUPPORTED', false],
    [
      { code: 'SPOTIFY_UNAVAILABLE', retryable: false },
      'UPSTREAM_FAILURE',
      false,
    ],
  ] as const)(
    'classifies structured failure %j safely',
    async (fields, code, retryable) => {
      const error = Object.assign(
        new Error('private credential and response'),
        fields
      );
      const result = await resolveInHouse(
        { kind: 'track', url: track.url },
        sources({
          urlRelsForIsrc: async () => {
            throw error;
          },
        })
      );
      expect(result.status).toBe('resolved');
      expect(result.links.map(link => link.url)).toEqual([track.url]);
      expect(result).toHaveProperty('sourceErrors', [
        {
          source: 'musicbrainz_isrc',
          code,
          retryable,
          ...('retryAfter' in fields
            ? { retryAfterSeconds: fields.retryAfter }
            : {}),
        },
      ]);
      expect(musicResolveOutputSchema.safeParse(result).success).toBe(true);
      expect(JSON.stringify(result)).not.toContain(error.message);
    }
  );

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    '10',
    null,
  ])('discards invalid retry delays: %s', async retryAfter => {
    const result = await resolveInHouse(
      { kind: 'track', url: track.url },
      sources({
        urlRelsForIsrc: async () => {
          throw Object.assign(new Error('private response'), {
            statusCode: 429,
            retryAfter,
          });
        },
      })
    );
    expect(result).toHaveProperty('sourceErrors', [
      {
        source: 'musicbrainz_isrc',
        code: 'RATE_LIMITED',
        retryable: true,
      },
    ]);
    expect(musicResolveOutputSchema.safeParse(result).success).toBe(true);
  });

  it.each([null, 'private upstream response'])(
    'normalizes an unstructured rejection safely: %s',
    async error => {
      const result = await resolveInHouse(
        { kind: 'track', url: track.url },
        sources({
          urlRelsForIsrc: async () => {
            throw error;
          },
        })
      );
      expect(result.status).toBe('resolved');
      expect(result).toHaveProperty('sourceErrors', [
        diagnostic('musicbrainz_isrc'),
      ]);
      expect(JSON.stringify(result)).not.toContain('private upstream response');
    }
  );

  it('exposes successful links and safe failures through the public transport', async () => {
    defaults.mockReturnValue(sources({ urlRelsForIsrc: rejected }));
    const result = await resolvePublicMusic({
      kind: 'track',
      input: track.url,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      sourceErrors: [diagnostic('musicbrainz_isrc')],
      links: [{ provider: track.provider, url: track.url }],
    });
    expect(result).not.toHaveProperty('error');
    expect(JSON.stringify(result)).not.toContain(failure.message);
  });

  it('honors caller cancellation while enrichment is settling', async () => {
    const controller = new AbortController();
    defaults.mockReturnValue(
      sources({
        urlRelsForIsrc: async () => {
          controller.abort();
          throw failure;
        },
      })
    );
    await expect(
      resolvePublicMusic({ kind: 'track', input: track.url }, controller.signal)
    ).resolves.toEqual({ error: { code: 'CANCELLED', retryable: false } });
  });

  it.each(['url', 'name'] as const)(
    'retains the verified %s identity when both enrichments fail',
    async mode => {
      const result = await resolveInHouse(
        mode === 'url'
          ? { kind: 'track', url: track.url }
          : { kind: 'track', artist: track.artist, title: track.title },
        sources({ trackByIsrc: rejected, urlRelsForIsrc: rejected })
      );
      expect(result).toMatchObject({
        status: 'resolved',
        title: track.title,
        artist: track.artist,
        isrc: track.isrc,
        links: [{ provider: track.provider, url: track.url }],
        confidence: 0.95,
        sourceErrors: [
          diagnostic('catalog_isrc'),
          diagnostic('musicbrainz_isrc'),
        ],
      });
      expect(result.links).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain(failure.message);
      expect(musicResolveOutputSchema.safeParse(result).success).toBe(true);
    }
  );

  it('retains healthy catalog metadata when MusicBrainz fails', async () => {
    const result = await resolveInHouse(
      { kind: 'track', isrc: track.isrc },
      sources({ trackByIsrc: async () => [track], urlRelsForIsrc: rejected })
    );
    expect(result).toMatchObject({
      status: 'resolved',
      title: track.title,
      artist: track.artist,
      sourceErrors: [diagnostic('musicbrainz_isrc')],
    });
    expect(result.links.map(link => link.url)).toEqual([track.url]);
  });

  it('retains MusicBrainz links when catalog enrichment fails', async () => {
    const result = await resolveInHouse(
      { kind: 'track', isrc: track.isrc },
      sources({ trackByIsrc: rejected, urlRelsForIsrc: async () => [relation] })
    );
    expect(result).toMatchObject({
      status: 'resolved',
      title: null,
      artist: null,
      isrc: track.isrc,
      confidence: 0.8,
      sourceErrors: [diagnostic('catalog_isrc')],
    });
    expect(result.links).toEqual([relation]);
  });

  it.each([false, true])(
    'reports incomplete absence as an upstream failure (both fail: %s)',
    async both => {
      const result = await resolveInHouse(
        { kind: 'track', isrc: track.isrc },
        sources({
          trackByIsrc: rejected,
          ...(both ? { urlRelsForIsrc: rejected } : {}),
        })
      );
      expect(result.status).toBe('upstream_error');
      expect(result.links).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result).toHaveProperty('sourceErrors', [
        diagnostic('catalog_isrc'),
        ...(both ? [diagnostic('musicbrainz_isrc')] : []),
      ]);
    }
  );

  it('keeps complete absence distinct from failed enrichment', async () => {
    const result = await resolveInHouse(
      { kind: 'track', isrc: track.isrc },
      sources()
    );
    expect(result.status).toBe('no_match');
    expect(result.links).toEqual([]);
    expect(result).not.toHaveProperty('sourceErrors');
  });

  it.each([
    new CallerCancellationError(),
    new DOMException('cancelled', 'AbortError'),
  ])('does not turn cancellation into partial success: %s', async error => {
    const result = await resolveInHouse(
      { kind: 'track', url: track.url },
      sources({
        urlRelsForIsrc: async () => {
          throw error;
        },
      })
    );
    expect(result.status).toBe('upstream_error');
    expect(result.links).toEqual([]);
    expect(result).not.toHaveProperty('sourceErrors');
  });

  it('allows bounded source diagnostics and rejects raw error fields', async () => {
    const result = await resolveInHouse(
      { kind: 'track', url: track.url },
      sources()
    );
    expect(
      musicResolveOutputSchema.safeParse({
        ...result,
        sourceErrors: [diagnostic('musicbrainz_isrc')],
      }).success
    ).toBe(true);
    expect(
      musicResolveOutputSchema.safeParse({
        ...result,
        sourceErrors: [
          { ...diagnostic('musicbrainz_isrc'), message: failure.message },
        ],
      }).success
    ).toBe(false);
    expect(
      musicResolveOutputSchema.safeParse({
        ...result,
        sourceErrors: [diagnostic('unknown_source')],
      }).success
    ).toBe(false);
  });
});
