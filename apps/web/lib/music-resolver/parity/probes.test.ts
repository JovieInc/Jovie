import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { resolveInHouse } from '../in-house';
import { PROVENANCE_CONFIDENCE } from '../in-house-contracts';
import { musicfetchRemediation } from '../musicfetch-gate';
import { runParityProbes } from './probes';
import { resolutionIsSuccess } from './truth';

describe('parity probes', () => {
  it('calls shipped resolveInHouse and rejects untruthful states', async () => {
    let resolveCalls = 0;
    const resolve: typeof resolveInHouse = async (query, fixture) => {
      resolveCalls += 1;
      return resolveInHouse(query, fixture);
    };
    const probes = await runParityProbes({
      resolve,
      remediate: musicfetchRemediation,
    });
    expect(resolveCalls).toBe(8);
    const byId = new Map(probes.map(probe => [probe.id, probe]));
    for (const id of [
      'isrc-lookup',
      'upc-lookup',
      'url-lookup',
      'search-exact',
      'distinct-mbid-not-success',
      'empty-isrc-not-success',
      'upstream-error-not-success',
      'ambiguous-remix-not-success',
      'musicfetch-dormant-not-renewal',
    ]) {
      expect(byId.get(id)?.outcome).toBe('passed');
      expect(byId.get(id)?.ref.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not treat a remix-only hit as a saved track', async () => {
    const result = await resolveInHouse(
      { kind: 'track', artist: 'Tim White', title: 'Take Me Over' },
      {
        trackByIsrc: async () => [],
        trackByUrl: async () => null,
        searchTracks: async () => [
          {
            provider: 'apple_music',
            title: 'Take Me Over (Austin Leeds Remix)',
            artist: 'Tim White',
            url: 'https://music.apple.com/us/song/take-me-over/1',
            isrc: null,
            upc: null,
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ],
        albumByUpc: async () => null,
        albumByUrl: async () => null,
        searchAlbums: async () => [],
        artistCandidates: async () => [],
        artistByUrl: async () => [],
        artistByMbid: async () => null,
        urlRelsForIsrc: async () => [],
      }
    );
    expect(result.status).toBe('ambiguous');
    expect(resolutionIsSuccess(result)).toBe(false);
  });

  it('does not treat an upstream throw or an empty ISRC as success', async () => {
    const empty = await resolveInHouse(
      { kind: 'track', isrc: 'ZZZZZ0000000' },
      {
        trackByIsrc: async () => [],
        trackByUrl: async () => null,
        searchTracks: async () => [],
        albumByUpc: async () => null,
        albumByUrl: async () => null,
        searchAlbums: async () => [],
        artistCandidates: async () => [],
        artistByUrl: async () => [],
        artistByMbid: async () => null,
        urlRelsForIsrc: async () => [],
      }
    );
    expect(empty.status).toBe('no_match');
    expect(resolutionIsSuccess(empty)).toBe(false);

    const failed = await resolveInHouse(
      {
        kind: 'track',
        url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
      },
      {
        trackByIsrc: async () => [],
        trackByUrl: async () => {
          throw new Error('spotify down');
        },
        searchTracks: async () => [],
        albumByUpc: async () => null,
        albumByUrl: async () => null,
        searchAlbums: async () => [],
        artistCandidates: async () => [],
        artistByUrl: async () => [],
        artistByMbid: async () => null,
        urlRelsForIsrc: async () => [],
      }
    );
    expect(failed.status).toBe('upstream_error');
    expect(resolutionIsSuccess(failed)).toBe(false);
  });
});
