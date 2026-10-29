import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock('../lib/music-resolver/in-house', () => ({
  resolveInHouse: mocks.resolve,
}));
vi.mock('../lib/music-resolver/in-house-sources', () => ({
  createDefaultInHouseSources: () => ({}),
}));

const { evaluate, spotifyAlbumId, summarizeBenchmark, wilson } = await import(
  './music-resolver-benchmark'
);

const TRUTH = 'https://open.spotify.com/album/004cO09qifdWIKgEoJaGeV';
const row = {
  spotify_url: TRUTH,
  upc: '5059460202801',
  title: 'Sunset',
  artist: 'David Guetta',
};

function resolved(links: { provider: string; url: string }[], upc = row.upc) {
  return {
    status: 'resolved',
    upc,
    links: links.map(link => ({ ...link, provenance: 'x', confidence: 0.9 })),
  };
}

describe('music resolver benchmark', () => {
  beforeEach(() => mocks.resolve.mockReset());

  it('computes a Wilson interval and null on an empty denominator', () => {
    expect(wilson(0, 0)).toBeNull();
    const interval = wilson(319, 319);
    expect(interval?.estimate).toBe(1);
    expect(interval?.low).toBeGreaterThan(0.98);
  });

  it('extracts Spotify album ids, ignoring market prefixes', () => {
    expect(spotifyAlbumId(TRUTH)).toBe('004cO09qifdWIKgEoJaGeV');
    expect(
      spotifyAlbumId(
        'https://open.spotify.com/intl-de/album/004cO09qifdWIKgEoJaGeV'
      )
    ).toBe('004cO09qifdWIKgEoJaGeV');
    expect(spotifyAlbumId('https://open.spotify.com/track/x')).toBeNull();
  });

  it('scores correct, wrong, abstained and missing-link outcomes', async () => {
    mocks.resolve
      .mockResolvedValueOnce(resolved([{ provider: 'spotify', url: TRUTH }]))
      .mockResolvedValueOnce(
        resolved([
          {
            provider: 'spotify',
            url: 'https://open.spotify.com/album/WRONGWRONGWRONGWRONG00',
          },
        ])
      )
      .mockResolvedValueOnce(resolved([], '0005059460202801'));
    const first = await evaluate(row);
    expect(first.cases).toEqual({
      upc_to_spotify: 'correct',
      name_to_spotify: 'wrong',
      url_to_upc: 'correct',
    });

    mocks.resolve
      .mockResolvedValueOnce({ status: 'no_match', upc: null, links: [] })
      .mockResolvedValueOnce(
        resolved([
          { provider: 'apple_music', url: 'https://music.apple.com/a' },
        ])
      )
      .mockRejectedValueOnce(new Error('timeout'));
    const second = await evaluate(row);
    expect(second.cases).toEqual({
      upc_to_spotify: 'abstained',
      name_to_spotify: 'no_spotify_link',
      url_to_upc: 'error',
    });

    const metrics = summarizeBenchmark([first, second]) as Record<
      string,
      {
        correct: number;
        wrong: number;
        providerCoverage: Record<string, number>;
      }
    >;
    expect(metrics.name_to_spotify.wrong).toBe(1);
    expect(metrics.name_to_spotify.providerCoverage).toEqual({
      spotify: 1,
      apple_music: 1,
    });
    expect(metrics.upc_to_spotify.correct).toBe(1);
  });
});
