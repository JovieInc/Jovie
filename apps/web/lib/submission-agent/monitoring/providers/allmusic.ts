import { serverFetch } from '@/lib/http/server-fetch';
import type {
  CanonicalSubmissionContext,
  DiscoveredTarget,
  ProviderSnapshot,
} from '../../types';

function extractMetaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractJsonLdValue(html: string, key: string): string | null {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  if (!scripts) {
    return null;
  }

  for (const script of scripts) {
    const contentMatch = script.match(/>([\s\S]*?)<\/script>/i);
    if (!contentMatch?.[1]) {
      continue;
    }

    try {
      const parsed = JSON.parse(contentMatch[1]) as Record<string, unknown>;
      const value = parsed[key];
      if (typeof value === 'string') {
        return value.trim();
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractTrackCount(html: string): number | null {
  const trackCountMatch =
    html.match(/(\d+)\s+tracks?/i) ??
    html.match(/"numTracks"\s*:\s*"?(?<count>\d+)"?/i);

  const rawValue =
    trackCountMatch?.groups?.count ?? trackCountMatch?.[1] ?? null;

  return rawValue ? Number.parseInt(rawValue, 10) : null;
}

function extractUpc(html: string): string | null {
  const match =
    html.match(/UPC[:\s]+([0-9A-Za-z-]+)/i) ??
    html.match(/Barcode[:\s]+([0-9A-Za-z-]+)/i);
  return match?.[1]?.trim() ?? null;
}

function collectResultUrls(html: string): string[] {
  const urls = new Set<string>();
  const regex = /href=["'](https?:\/\/www\.allmusic\.com\/[^"']+)["']/gi;

  for (const match of html.matchAll(regex)) {
    if (match[1]) {
      urls.add(match[1]);
    }
  }

  return Array.from(urls);
}

export async function discoverAllMusicTargets(
  canonical: CanonicalSubmissionContext
): Promise<DiscoveredTarget[]> {
  const artistName = encodeURIComponent(canonical.artistName);
  const releaseTitle = encodeURIComponent(canonical.release?.title ?? '');
  const discovered: DiscoveredTarget[] = [];

  const albumSearchUrl = `https://www.allmusic.com/search/albums/${artistName}%20${releaseTitle}`;
  const artistSearchUrl = `https://www.allmusic.com/search/artists/${artistName}`;

  const [albumResponse, artistResponse] = await Promise.all([
    serverFetch(albumSearchUrl, {
      context: 'AllMusic album search',
      timeoutMs: 8_000,
      retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
    }),
    serverFetch(artistSearchUrl, {
      context: 'AllMusic artist search',
      timeoutMs: 8_000,
      retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
    }),
  ]);

  const [albumHtml, artistHtml] = await Promise.all([
    albumResponse.text(),
    artistResponse.text(),
  ]);

  for (const url of collectResultUrls(albumHtml)) {
    if (url.includes('/album/')) {
      discovered.push({
        targetType: 'allmusic_release_page',
        canonicalUrl: url,
      });
      break;
    }
  }

  for (const url of collectResultUrls(artistHtml)) {
    if (url.includes('/artist/')) {
      discovered.push({
        targetType: 'allmusic_artist_page',
        canonicalUrl: url,
      });
      break;
    }
  }

  return discovered;
}

export async function snapshotAllMusicTarget(
  canonical: CanonicalSubmissionContext,
  target: DiscoveredTarget
): Promise<ProviderSnapshot | null> {
  const response = await serverFetch(target.canonicalUrl, {
    context: `AllMusic target fetch (${target.targetType})`,
    timeoutMs: 8_000,
    retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const ogTitle = extractMetaContent(html, 'og:title');
  const ogImage = extractMetaContent(html, 'og:image');
  const description =
    extractMetaContent(html, 'og:description') ??
    extractMetaContent(html, 'description');
  const jsonLdName = extractJsonLdValue(html, 'name');
  const published = extractJsonLdValue(html, 'datePublished');

  const releaseTitle =
    target.targetType === 'allmusic_release_page'
      ? (jsonLdName ??
        ogTitle?.split(' - ')[0] ??
        canonical.release?.title ??
        null)
      : (canonical.release?.title ?? null);

  return {
    targetType: target.targetType,
    canonicalUrl: target.canonicalUrl,
    normalizedData: {
      artistName:
        target.targetType === 'allmusic_artist_page'
          ? (jsonLdName ?? ogTitle?.split(' - ')[0] ?? canonical.artistName)
          : canonical.artistName,
      releaseTitle,
      releaseDate: published?.slice(0, 10) ?? null,
      upc: extractUpc(html),
      trackCount: extractTrackCount(html),
      hasCredits: /credits/i.test(html),
      hasBio: Boolean(description),
      hasArtistImage:
        target.targetType === 'allmusic_artist_page'
          ? Boolean(ogImage)
          : canonical.pressPhotos.length > 0,
      hasArtwork:
        target.targetType === 'allmusic_release_page'
          ? Boolean(ogImage)
          : Boolean(canonical.release?.artworkUrl),
    },
  };
}
