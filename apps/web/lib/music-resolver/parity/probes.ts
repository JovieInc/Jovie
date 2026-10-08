import { resolveInHouse as shippedResolveInHouse } from '../in-house';
import {
  type InHouseQuery,
  type InHouseSources,
  PROVENANCE_CONFIDENCE,
} from '../in-house-contracts';
import {
  MUSICFETCH_REMEDIATION_ISSUE,
  musicfetchRemediation as shippedMusicfetchRemediation,
} from '../musicfetch-gate';
import { resolutionIsSuccess } from './truth';
import type { ProbeResult } from './types';

export interface ParityProbeDeps {
  readonly resolve: typeof shippedResolveInHouse;
  readonly remediate: typeof shippedMusicfetchRemediation;
}

const appleTrack = {
  provider: 'apple_music',
  title: 'Signal Fire',
  artist: 'The Artist',
  url: 'https://music.apple.com/us/song/signal-fire/1234',
  isrc: 'USRC17607839',
  upc: null,
  provenance: 'apple_music_isrc',
  confidence: PROVENANCE_CONFIDENCE.isrc_exact,
};

function sources(overrides: Partial<InHouseSources> = {}): InHouseSources {
  return {
    trackByIsrc: async () => [],
    trackByUrl: async () => null,
    searchTracks: async () => [],
    albumByUpc: async () => null,
    albumByUrl: async () => null,
    searchAlbums: async () => [],
    artistCandidates: async () => [],
    artistByUrl: async () => null,
    artistByMbid: async () => null,
    urlRelsForIsrc: async () => [],
    ...overrides,
  };
}

function passed(id: string, ok: boolean): ProbeResult {
  return {
    id,
    outcome: ok ? 'passed' : 'failed',
    ref: ok ? `resolveInHouse:${id}` : '',
  };
}

async function expectSuccess(
  id: string,
  query: InHouseQuery,
  fixture: InHouseSources,
  resolve: ParityProbeDeps['resolve']
): Promise<ProbeResult> {
  try {
    const result = await resolve(query, fixture);
    return passed(id, resolutionIsSuccess(result));
  } catch {
    return passed(id, false);
  }
}

async function expectNotSuccess(
  id: string,
  query: InHouseQuery,
  fixture: InHouseSources,
  resolve: ParityProbeDeps['resolve']
): Promise<ProbeResult> {
  try {
    const result = await resolve(query, fixture);
    return passed(id, !resolutionIsSuccess(result));
  } catch {
    return passed(id, false);
  }
}

export async function runParityProbes(
  deps: Partial<ParityProbeDeps> = {}
): Promise<readonly ProbeResult[]> {
  const resolve = deps.resolve ?? shippedResolveInHouse;
  const remediate = deps.remediate ?? shippedMusicfetchRemediation;

  const remediation = remediate('missing_token');
  const dormantOk =
    remediation.renewal === false &&
    remediation.issue === MUSICFETCH_REMEDIATION_ISSUE;

  return [
    await expectSuccess(
      'isrc-lookup',
      { kind: 'track', isrc: 'USRC17607839' },
      sources({ trackByIsrc: async () => [appleTrack] }),
      resolve
    ),
    await expectSuccess(
      'upc-lookup',
      { kind: 'album', upc: '196589508261' },
      sources({
        albumByUpc: async () => ({
          provider: 'apple_music',
          title: 'Signal Fire',
          artist: 'The Artist',
          url: 'https://music.apple.com/us/album/signal-fire/1234',
          upc: '196589508261',
          provenance: 'upc_exact',
          confidence: PROVENANCE_CONFIDENCE.upc_exact,
        }),
      }),
      resolve
    ),
    await expectSuccess(
      'url-lookup',
      {
        kind: 'track',
        url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
      },
      sources({
        trackByUrl: async () => ({
          ...appleTrack,
          provider: 'spotify',
          url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
          provenance: 'input_url',
          confidence: PROVENANCE_CONFIDENCE.input_url,
        }),
      }),
      resolve
    ),
    await expectSuccess(
      'search-exact',
      { kind: 'track', artist: 'The Artist', title: 'Signal Fire' },
      sources({ searchTracks: async () => [appleTrack] }),
      resolve
    ),
    await expectNotSuccess(
      'distinct-mbid-not-success',
      { kind: 'artist', name: 'The Artist' },
      sources({
        artistCandidates: async () => [
          {
            name: 'The Artist',
            url: 'https://musicbrainz.org/artist/a',
            mbid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            links: [],
          },
          {
            name: 'The Artist',
            url: 'https://musicbrainz.org/artist/b',
            mbid: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            links: [],
          },
        ],
      }),
      resolve
    ),
    await expectNotSuccess(
      'empty-isrc-not-success',
      { kind: 'track', isrc: 'ZZZZZ0000000' },
      sources(),
      resolve
    ),
    await expectNotSuccess(
      'upstream-error-not-success',
      {
        kind: 'track',
        url: 'https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX',
      },
      sources({
        trackByUrl: async () => {
          throw new Error('spotify down');
        },
      }),
      resolve
    ),
    await expectNotSuccess(
      'ambiguous-remix-not-success',
      { kind: 'track', artist: 'Tim White', title: 'Take Me Over' },
      sources({
        searchTracks: async () => [
          {
            ...appleTrack,
            title: 'Take Me Over (Austin Leeds Remix)',
            artist: 'Tim White',
            provenance: 'exact_name',
            confidence: PROVENANCE_CONFIDENCE.exact_name,
          },
        ],
      }),
      resolve
    ),
    {
      id: 'musicfetch-dormant-not-renewal',
      outcome: dormantOk ? 'passed' : 'failed',
      ref: dormantOk ? 'musicfetchRemediation:missing_token' : '',
    },
  ];
}
