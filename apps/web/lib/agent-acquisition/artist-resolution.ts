import 'server-only';

import { PLATFORM_CDN_DOMAINS } from '@/constants/platforms/cdn-domains';
import {
  extractBio,
  extractImageUrls,
  getArtist as getAppleArtist,
  searchArtist as searchAppleArtists,
} from '@/lib/dsp-enrichment/providers/apple-music';
import type { AppleMusicArtist } from '@/lib/dsp-enrichment/types';
import { isBlacklistedSpotifyId } from '@/lib/spotify/blacklist';
import { type SearchArtistResult, spotifyClient } from '@/lib/spotify/client';
import { type SanitizedArtist, sanitizeText } from '@/lib/spotify/sanitize';
import { type ArtistProvider, parseAgentArtistInput } from './artist-input';

export interface PublicArtistSnapshot {
  readonly artist_id: string;
  readonly provider: ArtistProvider;
  readonly external_id: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly image_url: string | null;
  readonly bio: string | null;
  readonly genres: readonly string[];
}

export type ArtistResolution =
  | {
      status: 'resolved';
      next_action: 'workspace.create_draft';
      artist: PublicArtistSnapshot;
      retryable: false;
    }
  | {
      status: 'ambiguous_artist';
      next_action: 'select_artist';
      candidates: readonly PublicArtistSnapshot[];
      retryable: false;
    }
  | {
      status: 'error';
      code:
        | 'INVALID_INPUT'
        | 'UNSUPPORTED_INPUT'
        | 'ARTIST_NOT_FOUND'
        | 'UPSTREAM_FAILURE';
      next_action: 'correct_input' | 'retry';
      retryable: boolean;
    };

function imageUrl(
  value: string | null | undefined,
  provider: ArtistProvider
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    return PLATFORM_CDN_DOMAINS[provider]?.some(pattern =>
      pattern.startsWith('*.')
        ? url.hostname.endsWith(pattern.slice(1))
        : url.hostname === pattern
    )
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function spotifySnapshot(
  artist: SanitizedArtist | SearchArtistResult
): PublicArtistSnapshot {
  return {
    artist_id: `spotify:${artist.spotifyId}`,
    provider: 'spotify',
    external_id: artist.spotifyId,
    display_name: sanitizeText(artist.name, 200),
    source_url: `https://open.spotify.com/artist/${artist.spotifyId}`,
    image_url: imageUrl(artist.imageUrl, 'spotify'),
    bio: 'bio' in artist && artist.bio ? sanitizeText(artist.bio, 2000) : null,
    genres:
      'genres' in artist
        ? artist.genres.slice(0, 20).map(genre => sanitizeText(genre, 100))
        : [],
  };
}

function appleSnapshot(
  artist: AppleMusicArtist,
  storefront = 'us'
): PublicArtistSnapshot {
  return {
    artist_id: `apple_music:${artist.id}`,
    provider: 'apple_music',
    external_id: artist.id,
    display_name: sanitizeText(artist.attributes.name, 200),
    source_url: `https://music.apple.com/${storefront}/artist/${artist.id}`,
    image_url: imageUrl(
      extractImageUrls(artist.attributes.artwork)?.large,
      'apple_music'
    ),
    bio: extractBio(artist) ? sanitizeText(extractBio(artist)!, 2000) : null,
    genres: (artist.attributes.genreNames ?? [])
      .slice(0, 20)
      .map(genre => sanitizeText(genre, 100)),
  };
}

function validSnapshot(artist: PublicArtistSnapshot): boolean {
  return (
    Boolean(artist.display_name) &&
    parseAgentArtistInput({ input: artist.artist_id }).kind === 'exact' &&
    (artist.provider !== 'spotify' ||
      !isBlacklistedSpotifyId(artist.external_id))
  );
}

function errorResult(
  code: Extract<ArtistResolution, { status: 'error' }>['code']
): ArtistResolution {
  const retryable = code === 'UPSTREAM_FAILURE';
  return {
    status: 'error',
    code,
    next_action: retryable ? 'retry' : 'correct_input',
    retryable,
  };
}

/**
 * Public provider facts only. No owner/profile query, claim, ingestion, publication
 * or acquisition tracking occurs here. Provider-qualified IDs are not ownership.
 * Existing provider clients own bounded HTTP, retries, credentials and circuits.
 */
export async function resolveAgentArtist(
  input: unknown
): Promise<ArtistResolution> {
  const parsed = parseAgentArtistInput(input);
  if (parsed.kind === 'invalid') return errorResult(parsed.code);
  try {
    if (parsed.kind === 'exact') {
      if (parsed.provider === 'spotify' && isBlacklistedSpotifyId(parsed.id)) {
        return errorResult('ARTIST_NOT_FOUND');
      }
      const raw =
        parsed.provider === 'spotify'
          ? await spotifyClient.getArtist(parsed.id)
          : await getAppleArtist(parsed.id, {
              storefront: parsed.storefront ?? 'us',
            });
      if (!raw) return errorResult('ARTIST_NOT_FOUND');
      const artist =
        'spotifyId' in raw
          ? spotifySnapshot(raw)
          : appleSnapshot(raw, parsed.storefront);
      if (!validSnapshot(artist) || artist.external_id !== parsed.id) {
        return errorResult('UPSTREAM_FAILURE');
      }
      return {
        status: 'resolved',
        next_action: 'workspace.create_draft',
        artist,
        retryable: false,
      };
    }

    const found =
      parsed.provider === 'spotify'
        ? (await spotifyClient.searchArtists(parsed.query, 5)).map(
            spotifySnapshot
          )
        : (await searchAppleArtists(parsed.query, {}, 5)).map(artist =>
            appleSnapshot(artist)
          );
    const seen = new Set<string>();
    // Preserve provider relevance order; duplicate results never become two artists.
    const candidates = found
      .filter(artist => {
        if (!validSnapshot(artist) || seen.has(artist.artist_id)) return false;
        seen.add(artist.artist_id);
        return true;
      })
      .slice(0, 5);
    if (candidates.length === 0) return errorResult('ARTIST_NOT_FOUND');
    // Even one name match requires explicit identity selection before import.
    return {
      status: 'ambiguous_artist',
      next_action: 'select_artist',
      candidates,
      retryable: false,
    };
  } catch (error) {
    const notFound =
      error instanceof Error &&
      (('code' in error && error.code === 'SPOTIFY_NOT_FOUND') ||
        ('statusCode' in error && error.statusCode === 404));
    return errorResult(notFound ? 'ARTIST_NOT_FOUND' : 'UPSTREAM_FAILURE');
  }
}
