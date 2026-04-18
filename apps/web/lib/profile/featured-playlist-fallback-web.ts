import 'server-only';

import { z } from 'zod';
import { spotifyPlaylistIdSchema } from '@/lib/validation/schemas/spotify';

export const PLAYLIST_SOURCE = 'serp_html';

const featuredPlaylistFallbackCandidateSchema = z.object({
  playlistId: spotifyPlaylistIdSchema,
  title: z.string().min(1),
  url: z.string().url(),
  imageUrl: z.string().url().nullable(),
  artistSpotifyId: z.string().min(1),
  source: z.literal(PLAYLIST_SOURCE),
  discoveredAt: z.string().datetime(),
  searchQuery: z.string().min(1),
});

export type FeaturedPlaylistFallbackCandidate = z.infer<
  typeof featuredPlaylistFallbackCandidateSchema
>;

function decodeHtmlEntities(value: string): string {
  return value.replaceAll(
    /&(#x?[0-9a-fA-F]+|amp|apos|quot|lt|gt);/g,
    (match, entity: string) => {
      switch (entity) {
        case 'amp':
          return '&';
        case 'apos':
          return "'";
        case 'quot':
          return '"';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        default:
          if (entity.startsWith('#x')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
          }
          if (entity.startsWith('#')) {
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
          }
          return match;
      }
    }
  );
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string): string {
  return normalizeWhitespace(decodeHtmlEntities(value)).toLowerCase();
}

function getMetaContent(
  html: string,
  attribute: 'property' | 'name',
  key: string
): string | null {
  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = pattern.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function getHtmlTitle(html: string): string | null {
  const match = /<title>([^<]+)<\/title>/i.exec(html);
  return match ? decodeHtmlEntities(match[1]) : null;
}

export function normalizeSpotifyPlaylistUrl(
  rawUrl: string
): { playlistId: string; url: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const hostOk =
      parsed.hostname === 'open.spotify.com' ||
      parsed.hostname === 'www.open.spotify.com';

    if (!hostOk) {
      return null;
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const playlistSegmentIndex = pathSegments[0] === 'embed' ? 1 : 0;

    if (
      pathSegments[playlistSegmentIndex] !== 'playlist' ||
      !pathSegments[playlistSegmentIndex + 1]
    ) {
      return null;
    }

    const playlistIdResult = spotifyPlaylistIdSchema.safeParse(
      pathSegments[playlistSegmentIndex + 1]
    );
    if (!playlistIdResult.success) {
      return null;
    }

    return {
      playlistId: playlistIdResult.data,
      url: `https://open.spotify.com/playlist/${playlistIdResult.data}`,
    };
  } catch {
    return null;
  }
}

export function validateThisIsPlaylistPage(params: {
  readonly artistName: string;
  readonly artistSpotifyId: string;
  readonly html: string;
  readonly playlistId: string;
  readonly url: string;
}): Omit<
  FeaturedPlaylistFallbackCandidate,
  'artistSpotifyId' | 'discoveredAt' | 'searchQuery' | 'source'
> | null {
  const title = getHtmlTitle(params.html);
  const canonicalUrl =
    getMetaContent(params.html, 'property', 'og:url') ??
    getMetaContent(params.html, 'name', 'og:url');
  const imageUrl =
    getMetaContent(params.html, 'property', 'og:image') ??
    getMetaContent(params.html, 'name', 'og:image');
  const ownerLooksLikeSpotify =
    params.html.includes('spotify:user:spotify') ||
    params.html.includes('"username":"spotify"') ||
    params.html.includes('"name":"Spotify"');

  if (
    !title ||
    normalizeTitle(title) !==
      normalizeTitle(`This Is ${params.artistName} | Spotify Playlist`)
  ) {
    return null;
  }

  const normalizedCanonical = canonicalUrl
    ? normalizeSpotifyPlaylistUrl(canonicalUrl)
    : null;
  if (normalizedCanonical?.playlistId !== params.playlistId) {
    return null;
  }

  if (!ownerLooksLikeSpotify) {
    return null;
  }

  if (!params.html.includes(`spotify:artist:${params.artistSpotifyId}`)) {
    return null;
  }

  return {
    playlistId: params.playlistId,
    title: normalizeWhitespace(
      decodeHtmlEntities(title.replace(/\|\s*Spotify Playlist$/i, ''))
    ),
    url: params.url,
    imageUrl,
  };
}
