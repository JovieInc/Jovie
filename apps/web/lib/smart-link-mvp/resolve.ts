import 'server-only';

import { PROVIDER_CONFIG } from '@/lib/discography/config';
import {
  resolveSmartLinkCreation,
  type SmartLinkCreationResult,
} from '@/lib/music-resolver/smart-link';
import { splitArtistTitle } from './match';
import { providerKeyForUrl } from './parse-input';
import type {
  ResolvedRelease,
  ResolveResult,
  SmartLinkResolver,
} from './types';

function failed(
  result: Exclude<SmartLinkCreationResult, { status: 'resolved' | 'choices' }>
): ResolveResult<never> {
  return {
    ok: false,
    code: result.status === 'not_found' ? 'NOT_FOUND' : 'UPSTREAM_FAILURE',
    retryable: result.retryable,
  };
}

function release(
  result: Extract<SmartLinkCreationResult, { status: 'resolved' }>
): ResolvedRelease {
  const providers = result.providers.flatMap(provider => {
    const config = PROVIDER_CONFIG[provider.key];
    return config
      ? [{ key: provider.key, label: config.label, url: provider.url }]
      : [];
  });
  return {
    title: result.title,
    artist: result.artist,
    artworkUrl: null,
    isrc: result.isrc,
    upc: result.upc,
    providerKey: providerKeyForUrl(providers[0]?.url ?? ''),
    providers,
  };
}

function candidates(result: SmartLinkCreationResult) {
  if (result.status === 'choices') {
    return result.candidates.map(candidate => ({
      id: providerKeyForUrl(candidate.url) ?? candidate.url,
      name: candidate.title,
      artist: candidate.artist,
      url: candidate.url,
      artworkUrl: null,
    }));
  }
  if (result.status !== 'resolved') return [];
  const url = result.providers[0]?.url ?? null;
  return url && result.title
    ? [
        {
          id: providerKeyForUrl(url) ?? url,
          name: result.title,
          artist: result.artist,
          url,
          artworkUrl: null,
        },
      ]
    : [];
}

export function createSmartLinkResolver(): SmartLinkResolver {
  return {
    async resolveTrackUrl(url) {
      const result = await resolveSmartLinkCreation({
        source: 'track_url',
        url,
      });
      return result.status === 'resolved'
        ? { ok: true, value: release(result) }
        : result.status === 'choices'
          ? { ok: false, code: 'NOT_FOUND', retryable: false }
          : failed(result);
    },
    async resolveIsrc(isrc) {
      const result = await resolveSmartLinkCreation({ source: 'isrc', isrc });
      return result.status === 'resolved'
        ? { ok: true, value: release(result) }
        : result.status === 'choices'
          ? { ok: false, code: 'NOT_FOUND', retryable: false }
          : failed(result);
    },
    async searchTracks(query) {
      const parts = splitArtistTitle(query);
      if (!parts) {
        return { ok: false, code: 'UNSUPPORTED_INPUT', retryable: false };
      }
      const result = await resolveSmartLinkCreation({
        source: 'track_query',
        ...parts,
      });
      return result.status === 'resolved' || result.status === 'choices'
        ? { ok: true, value: candidates(result) }
        : failed(result);
    },
    async resolveArtist(query) {
      const result = await resolveSmartLinkCreation(
        query.startsWith('https://')
          ? { source: 'artist_url', url: query }
          : { source: 'artist', name: query }
      );
      if (result.status === 'resolved') {
        return {
          ok: true,
          value: { status: 'resolved', release: release(result) },
        };
      }
      if (result.status === 'choices') {
        return {
          ok: true,
          value: { status: 'choices', candidates: candidates(result) },
        };
      }
      return failed(result);
    },
  };
}
