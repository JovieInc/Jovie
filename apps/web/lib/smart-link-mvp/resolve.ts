import 'server-only';

import { resolveAgentArtist } from '@/lib/agent-acquisition/artist-resolution';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { isMusicfetchAvailable } from '@/lib/discography/musicfetch';
import {
  MusicfetchBudgetExceededError,
  musicfetchRequest,
} from '@/lib/musicfetch/resilient-client';
import {
  resolveInHouseIsrc,
  resolveInHouseTrackUrl,
  searchInHouseArtists,
  searchInHouseTracks,
} from './in-house';
import {
  candidatesFromSearch,
  releaseFromMusicfetch,
  SMART_LINK_MUSICFETCH_SERVICES,
} from './musicfetch-map';
import { providerKeyForUrl } from './parse-input';
import type {
  ResolvedRelease,
  ResolveResult,
  SmartLinkResolver,
} from './types';

const TIMEOUT_MS = 15_000;

function failure(
  code: 'NOT_FOUND' | 'BUDGET_EXHAUSTED' | 'UPSTREAM_FAILURE'
): ResolveResult<never> {
  return {
    ok: false,
    code,
    retryable: code !== 'NOT_FOUND',
  };
}

async function musicfetch<T>(
  endpoint: '/url' | '/isrc' | '/search',
  params: Record<string, string>
): Promise<ResolveResult<T>> {
  try {
    const value = await musicfetchRequest<T>(
      endpoint,
      new URLSearchParams({
        ...params,
        ...(endpoint === '/search'
          ? {}
          : { services: SMART_LINK_MUSICFETCH_SERVICES }),
      }),
      { timeoutMs: TIMEOUT_MS }
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof MusicfetchBudgetExceededError) {
      return failure('BUDGET_EXHAUSTED');
    }
    const status =
      error && typeof error === 'object' && 'statusCode' in error
        ? error.statusCode
        : undefined;
    // 401/403 means the unpaid MusicFetch token cannot be used. That is not a
    // retryable outage and it is not a reason to ask anyone to renew a key.
    if (status === 404 || status === 401 || status === 403) {
      return failure('NOT_FOUND');
    }
    return failure('UPSTREAM_FAILURE');
  }
}

function artistRelease(
  name: string,
  artworkUrl: string | null,
  source: string
): ResolvedRelease | null {
  const key = providerKeyForUrl(source);
  const provider = key?.startsWith('artist:')
    ? key.split(':')[1]
    : key?.split(':')[0];
  const config = provider ? PROVIDER_CONFIG[provider] : undefined;
  if (!config || !provider) return null;
  return {
    title: name,
    artist: name,
    artworkUrl,
    isrc: null,
    upc: null,
    providerKey: key,
    providers: [{ key: provider, label: config.label, url: source }],
  };
}

async function musicfetchRelease(
  endpoint: '/url' | '/isrc',
  params: Record<string, string>,
  sourceUrl?: string
): Promise<ResolveResult<ResolvedRelease>> {
  if (!isMusicfetchAvailable()) return failure('NOT_FOUND');
  const response = await musicfetch<unknown>(endpoint, params);
  if (!response.ok) return response;
  const release = releaseFromMusicfetch(response.value, sourceUrl);
  if (!release) return failure('NOT_FOUND');
  return { ok: true, value: release };
}

/**
 * In-house Apple, Deezer, and Spotify lookups run first. MusicFetch is only
 * a fallback when it is configured, and a 401 does not fail a link the
 * in-house lookups already resolved.
 */
export function createSmartLinkResolver(): SmartLinkResolver {
  return {
    async resolveTrackUrl(url) {
      const house = await resolveInHouseTrackUrl(url);
      if (house) return { ok: true, value: house };
      return musicfetchRelease('/url', { url }, url);
    },
    async resolveIsrc(isrc) {
      const house = await resolveInHouseIsrc(isrc);
      if (house) return { ok: true, value: house };
      const vendor = await musicfetchRelease('/isrc', { isrc });
      if (!vendor.ok) return vendor;
      return {
        ok: true,
        value: { ...vendor.value, isrc: vendor.value.isrc ?? isrc },
      };
    },
    async searchTracks(query) {
      const house = await searchInHouseTracks(query);
      if (house.status === 'ok') return { ok: true, value: house.candidates };
      if (!isMusicfetchAvailable()) return failure('UPSTREAM_FAILURE');
      const response = await musicfetch<unknown>('/search', {
        query,
        types: 'track',
      });
      if (!response.ok) return response;
      return { ok: true, value: candidatesFromSearch(response.value) };
    },
    async resolveArtist(query) {
      const artist = await resolveAgentArtist({ input: query });
      if (artist.status === 'error') {
        if (
          artist.code === 'UNSUPPORTED_INPUT' ||
          artist.code === 'INVALID_INPUT'
        ) {
          return { ok: false, code: 'UNSUPPORTED_INPUT', retryable: false };
        }
        if (providerKeyForUrl(query)?.startsWith('artist:')) {
          const release = artistRelease(query, null, query);
          if (release) {
            return {
              ok: true,
              value: {
                status: 'resolved',
                release: { ...release, title: null, artist: null },
              },
            };
          }
        }
        const found = await searchInHouseArtists(query);
        if (found === null) {
          return failure(
            artist.code === 'ARTIST_NOT_FOUND'
              ? 'NOT_FOUND'
              : 'UPSTREAM_FAILURE'
          );
        }
        if (found.length === 0) return failure('NOT_FOUND');
        return { ok: true, value: { status: 'choices', candidates: found } };
      }
      if (artist.status === 'ambiguous_artist') {
        return {
          ok: true,
          value: {
            status: 'choices',
            candidates: artist.candidates.map(candidate => ({
              id: candidate.artist_id,
              name: candidate.display_name,
              artist: null,
              url: candidate.source_url,
              artworkUrl: candidate.image_url,
            })),
          },
        };
      }
      const source = artist.artist.source_url;
      const release = artistRelease(
        artist.artist.display_name,
        artist.artist.image_url,
        source
      );
      if (!release) return failure('NOT_FOUND');
      return { ok: true, value: { status: 'resolved', release } };
    },
  };
}

/** @deprecated Use createSmartLinkResolver. MusicFetch is the fallback only. */
export function createMusicfetchResolver(): SmartLinkResolver {
  return createSmartLinkResolver();
}
