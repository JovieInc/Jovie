import 'server-only';

import { resolveAgentArtist } from '@/lib/agent-acquisition/artist-resolution';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import {
  MusicfetchBudgetExceededError,
  musicfetchRequest,
} from '@/lib/musicfetch/resilient-client';
import {
  candidatesFromSearch,
  releaseFromMusicfetch,
  SMART_LINK_MUSICFETCH_SERVICES,
} from './musicfetch-map';
import { providerKeyForUrl } from './parse-input';
import type { ResolveResult, SmartLinkResolver } from './types';

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
    return status === 404 ? failure('NOT_FOUND') : failure('UPSTREAM_FAILURE');
  }
}

export function createMusicfetchResolver(): SmartLinkResolver {
  return {
    async resolveTrackUrl(url) {
      const response = await musicfetch<unknown>('/url', { url });
      if (!response.ok) return response;
      const release = releaseFromMusicfetch(response.value, url);
      return release ? { ok: true, value: release } : failure('NOT_FOUND');
    },
    async resolveIsrc(isrc) {
      const response = await musicfetch<unknown>('/isrc', { isrc });
      if (!response.ok) return response;
      const release = releaseFromMusicfetch(response.value);
      if (!release) return failure('NOT_FOUND');
      return {
        ok: true,
        value: { ...release, isrc: release.isrc ?? isrc },
      };
    },
    async searchTracks(query) {
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
        if (artist.code === 'ARTIST_NOT_FOUND') return failure('NOT_FOUND');
        if (
          artist.code === 'UNSUPPORTED_INPUT' ||
          artist.code === 'INVALID_INPUT'
        ) {
          return { ok: false, code: 'UNSUPPORTED_INPUT', retryable: false };
        }
        return failure('UPSTREAM_FAILURE');
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
      const lookedUp = await musicfetch<unknown>('/url', { url: source });
      if (!lookedUp.ok) {
        if (lookedUp.code === 'BUDGET_EXHAUSTED') return lookedUp;
        const key = providerKeyForUrl(source);
        const provider = key?.startsWith('artist:')
          ? key.split(':')[1]
          : key?.split(':')[0];
        const config = provider ? PROVIDER_CONFIG[provider] : undefined;
        if (!config || !provider) return failure('NOT_FOUND');
        return {
          ok: true,
          value: {
            status: 'resolved',
            release: {
              title: artist.artist.display_name,
              artist: artist.artist.display_name,
              artworkUrl: artist.artist.image_url,
              isrc: null,
              upc: null,
              providerKey: key,
              providers: [{ key: provider, label: config.label, url: source }],
            },
          },
        };
      }
      const release = releaseFromMusicfetch(lookedUp.value, source, {
        releaseOnly: false,
      });
      if (!release) return failure('NOT_FOUND');
      return {
        ok: true,
        value: {
          status: 'resolved',
          release: {
            ...release,
            title: release.title ?? artist.artist.display_name,
            artist: release.artist ?? artist.artist.display_name,
            artworkUrl: release.artworkUrl ?? artist.artist.image_url,
            providerKey: release.providerKey ?? providerKeyForUrl(source),
          },
        },
      };
    },
  };
}
