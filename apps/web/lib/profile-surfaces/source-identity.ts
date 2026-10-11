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
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
} from '@/lib/ingestion/strategies/youtube';
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

function metadataMatchesProfile(
  metadataUrl: string | null,
  source: URL
): boolean {
  if (!metadataUrl) return false;
  try {
    const metadata = new URL(metadataUrl);
    const host = source.hostname.replace(/^www\./, '');
    if (
      metadata.protocol !== 'https:' ||
      metadata.username ||
      metadata.password ||
      metadata.port ||
      metadata.hostname.replace(/^www\./, '') !== host
    )
      return false;
    if (host === 'deezer.com') {
      const artist = /^\/(?:[a-z]{2}\/)?artist\/(\d+)\/?$/;
      const sourceId = artist.exec(source.pathname)?.[1];
      return !!sourceId && sourceId === artist.exec(metadata.pathname)?.[1];
    }
    return (
      metadata.pathname.replace(/\/$/, '') ===
      source.pathname.replace(/\/$/, '')
    );
  } catch {
    return false;
  }
}

function isSourceAvatar(source: URL, imageUrl: string): boolean {
  const image = new URL(imageUrl);
  if (image.port) return false;
  if (['soundcloud.com', 'www.soundcloud.com'].includes(source.hostname)) {
    return (
      /^\/[^/]+\/?$/.test(source.pathname) &&
      /^i\d+\.sndcdn\.com$/.test(image.hostname) &&
      image.pathname.startsWith('/avatars-') &&
      /^[^/]+\.jpg$/.test(image.pathname.slice('/avatars-'.length))
    );
  }
  return (
    ['deezer.com', 'www.deezer.com'].includes(source.hostname) &&
    image.hostname === 'cdn-images.dzcdn.net' &&
    /^\/images\/artist\/(?!0+\/)[a-f0-9]+\/[^/]+\.jpg$/i.test(image.pathname)
  );
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
    url.port ||
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
      const match = /^\/([a-z]{2})\/artist\/[^/]+\/(\d+)\/?$/.exec(
        url.pathname
      );
      const id = match?.[2];
      const storefront = match?.[1];
      if (id && storefront) {
        const artist = await getAppleMusicArtist(id, { storefront });
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
    const isYouTubeChannel =
      ['youtube.com', 'www.youtube.com'].includes(url.hostname) &&
      /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+)\/?$/.test(url.pathname);
    const html = isYouTubeChannel
      ? await fetchYouTubeAboutDocument(url.toString(), {
          timeoutMs: 4000,
          maxRetries: 0,
        })
      : (
          await fetchDocument(url.toString(), {
            timeoutMs: 4000,
            maxRetries: 0,
            allowedHosts: PUBLIC_PAGE_HOSTS,
          })
        ).html;
    if (isYouTubeChannel) {
      const channel = extractYouTube(html);
      const avatar = httpsImage(channel.avatarUrl);
      if (avatar)
        return {
          ...unavailable,
          status: 'available',
          displayName: channel.displayName ?? null,
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
    const pageTitle = extractMetaContent(html, 'og:title')?.trim() || null;
    if (!ogImage && !pageTitle) return unavailable;
    if (
      ogImage &&
      pageTitle &&
      extractMetaContent(html, 'og:type') === 'music.musician' &&
      metadataMatchesProfile(extractMetaContent(html, 'og:url'), url) &&
      isSourceAvatar(url, ogImage)
    ) {
      return {
        ...unavailable,
        status: 'available',
        displayName: pageTitle,
        pageTitle,
        photo: {
          url: ogImage,
          kind: 'profile',
          source: 'public_metadata',
          verified: false,
          observedAt,
          freshness: 'current',
        },
      };
    }
    return {
      ...unavailable,
      status: 'available',
      pageTitle,
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
