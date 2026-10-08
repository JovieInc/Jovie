import 'server-only';

import {
  extractAppleMusicImageUrls,
  extractDeezerImageUrls,
  extractSpotifyImageUrls,
  getAppleMusicArtist,
  getDeezerArtist,
  getSpotifyArtistProfile,
  isAppleMusicAvailable,
  isDeezerAvailable,
  isSpotifyAvailable,
} from '@/lib/dsp-enrichment/providers';
import { isCoreSocialHtmlHost } from '@/lib/ingestion/social-html-policy';
import {
  extractMetaContent,
  fetchDocument,
} from '@/lib/ingestion/strategies/base';
import { extractYouTube } from '@/lib/ingestion/strategies/youtube';
import {
  MISSING_IDENTITY_PHOTO,
  type SourceIdentity,
} from './presence-identity';

export type { SourceIdentity } from './presence-identity';

// Compose the maintained ingestion/provider clients; never fetch arbitrary hosts.
const PUBLIC_PAGE_HOSTS = new Set([
  'tidal.com',
  'www.tidal.com',
  'listen.tidal.com',
  'soundcloud.com',
  'www.soundcloud.com',
  'www.youtube.com',
  'youtube.com',
  'music.youtube.com',
  'www.deezer.com',
  'deezer.com',
  'music.apple.com',
  'open.spotify.com',
]);

function httpsImage(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export async function readSourceIdentity(
  sourceUrl: string
): Promise<SourceIdentity> {
  const unavailable: SourceIdentity = {
    status: 'unavailable',
    displayName: null,
    pageTitle: null,
    photo: MISSING_IDENTITY_PHOTO,
    sourceUrl,
  };
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return unavailable;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    isCoreSocialHtmlHost(url.hostname) ||
    !PUBLIC_PAGE_HOSTS.has(url.hostname)
  ) {
    return { ...unavailable, status: 'unsupported' };
  }
  const observedAt = new Date().toISOString();
  let displayName: string | null = null;
  let imageUrl: string | null = null;
  try {
    if (url.hostname === 'open.spotify.com' && isSpotifyAvailable()) {
      const id = /^\/artist\/([a-zA-Z0-9]+)\/?$/.exec(url.pathname)?.[1];
      if (id) {
        const artist = await getSpotifyArtistProfile(id);
        if (artist) {
          displayName = artist.name;
          const images = extractSpotifyImageUrls(artist.images);
          imageUrl = httpsImage(images?.large ?? images?.original);
        }
      }
    } else if (url.hostname === 'music.apple.com' && isAppleMusicAvailable()) {
      const id = /^\/[a-z]{2}\/artist\/[^/]+\/(\d+)\/?$/.exec(
        url.pathname
      )?.[1];
      if (id) {
        const artist = await getAppleMusicArtist(id);
        if (artist) {
          displayName = artist.attributes.name;
          const images = extractAppleMusicImageUrls(artist.attributes.artwork);
          imageUrl = httpsImage(images?.large ?? images?.original);
        }
      }
    } else if (
      ['www.deezer.com', 'deezer.com'].includes(url.hostname) &&
      isDeezerAvailable()
    ) {
      const id = /^\/(?:[a-z]{2}\/)?artist\/(\d+)\/?$/.exec(url.pathname)?.[1];
      if (id) {
        const artist = await getDeezerArtist(id);
        if (artist) {
          displayName = artist.name;
          const images = extractDeezerImageUrls(artist);
          imageUrl = httpsImage(images?.large ?? images?.original);
        }
      }
    }
    if (displayName || imageUrl) {
      return {
        ...unavailable,
        status: 'available',
        displayName,
        photo: imageUrl
          ? {
              url: imageUrl,
              source: 'connector',
              kind: 'profile',
              verified: false,
              observedAt,
              freshness: 'current',
            }
          : MISSING_IDENTITY_PHOTO,
      };
    }
    const { html } = await fetchDocument(url.toString(), {
      timeoutMs: 4000,
      maxRetries: 0,
      allowedHosts: PUBLIC_PAGE_HOSTS,
    });
    if (
      ['youtube.com', 'www.youtube.com'].includes(url.hostname) &&
      /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/.test(url.pathname)
    ) {
      const channel = extractYouTube(html);
      const avatar = httpsImage(channel.avatarUrl);
      if (avatar)
        return {
          ...unavailable,
          status: 'available',
          displayName: channel.displayName,
          photo: {
            url: avatar,
            kind: 'profile',
            source: 'public_metadata',
            verified: false,
            observedAt,
            freshness: 'current',
          },
        };
    }
    const ogImage = httpsImage(extractMetaContent(html, 'og:image'));
    return {
      ...unavailable,
      status: 'available',
      pageTitle: extractMetaContent(html, 'og:title'),
      // Even og:type=profile and a square image can be artwork (observed on Tidal).
      photo: ogImage
        ? {
            url: ogImage,
            kind: 'generic',
            source: 'public_metadata',
            verified: false,
            observedAt,
            freshness: 'current',
          }
        : MISSING_IDENTITY_PHOTO,
    };
  } catch {
    return unavailable;
  }
}
