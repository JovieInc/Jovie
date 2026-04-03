import { serverFetch } from '@/lib/http/server-fetch';
import type {
  CanonicalSubmissionContext,
  DiscoveredTarget,
  ProviderSnapshot,
  SubmissionMonitoringBaseline,
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
    const content = extractScriptContent(script);
    if (!content) {
      continue;
    }

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
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

function extractJsonLdEntityName(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractJsonLdEntityName(entry);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0
  ) {
    return value.name.trim();
  }

  return null;
}

function extractJsonLdArtistName(html: string): string | null {
  const scripts = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  if (!scripts) {
    return null;
  }

  for (const script of scripts) {
    const content = extractScriptContent(script);
    if (!content) {
      continue;
    }

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const artistName =
        extractJsonLdEntityName(parsed.byArtist) ??
        extractJsonLdEntityName(parsed.artist) ??
        extractJsonLdEntityName(parsed.author);

      if (artistName) {
        return artistName;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractScriptContent(script: string): string | null {
  const openTagEnd = script.indexOf('>');
  if (openTagEnd === -1) {
    return null;
  }

  const closeTagStart = script.toLowerCase().lastIndexOf('</script>');
  if (closeTagStart === -1 || closeTagStart <= openTagEnd) {
    return null;
  }

  const content = script.slice(openTagEnd + 1, closeTagStart).trim();
  return content.length > 0 ? content : null;
}

function extractTrackCount(html: string): number | null {
  const fromJsonLd = extractNumericValueAfterToken(html, '"numTracks"');
  if (fromJsonLd !== null) {
    return fromJsonLd;
  }

  return extractNumericValueBeforeTrackLabel(html);
}

function extractNumericValueAfterToken(
  html: string,
  token: string
): number | null {
  const tokenIndex = html.indexOf(token);
  if (tokenIndex === -1) {
    return null;
  }

  for (let index = tokenIndex + token.length; index < html.length; index += 1) {
    const char = html[index];
    if (char >= '0' && char <= '9') {
      let end = index + 1;

      while (end < html.length && html[end] >= '0' && html[end] <= '9') {
        end += 1;
      }

      return Number.parseInt(html.slice(index, end), 10);
    }
  }

  return null;
}

function extractNumericValueBeforeTrackLabel(html: string): number | null {
  const lowerHtml = html.toLowerCase();
  const trackLabelIndex = lowerHtml.indexOf('track');
  if (trackLabelIndex === -1) {
    return null;
  }

  let index = trackLabelIndex - 1;
  while (index >= 0 && /\s/.test(html[index] ?? '')) {
    index -= 1;
  }

  let start = index;
  while (start >= 0 && html[start] >= '0' && html[start] <= '9') {
    start -= 1;
  }

  const digits = html.slice(start + 1, index + 1);
  return digits.length > 0 ? Number.parseInt(digits, 10) : null;
}

function extractUpc(html: string): string | null {
  const match =
    html.match(/UPC[:\s]+([0-9A-Za-z-]+)/i) ??
    html.match(/Barcode[:\s]+([0-9A-Za-z-]+)/i);
  return match?.[1]?.trim() ?? null;
}

function normalizeComparableValue(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return normalized.length > 0 ? normalized : null;
}

function matchesCanonicalValue(
  observed: string | null | undefined,
  expected: string | null | undefined
): boolean {
  const normalizedObserved = normalizeComparableValue(observed);
  const normalizedExpected = normalizeComparableValue(expected);

  if (!normalizedObserved || !normalizedExpected) {
    return false;
  }

  return (
    normalizedObserved === normalizedExpected ||
    normalizedObserved.includes(normalizedExpected) ||
    normalizedExpected.includes(normalizedObserved)
  );
}

function extractHeadingFromOgTitle(ogTitle: string | null): string | null {
  const heading = ogTitle?.split('|')[0]?.trim() ?? null;
  return heading && heading.length > 0 ? heading : null;
}

function extractReleaseTitleFromOgTitle(ogTitle: string | null): string | null {
  const heading = extractHeadingFromOgTitle(ogTitle);
  if (!heading) {
    return null;
  }

  return heading.split(' - ')[0]?.trim() || null;
}

function extractArtistNameFromOgTitle(params: {
  ogTitle: string | null;
  targetType: DiscoveredTarget['targetType'];
}): string | null {
  const heading = extractHeadingFromOgTitle(params.ogTitle);
  if (!heading) {
    return null;
  }

  if (params.targetType === 'allmusic_release_page') {
    const segments = heading.split(' - ');
    return segments.length > 1 ? segments.slice(1).join(' - ').trim() : null;
  }

  return heading;
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

function parseAllMusicSnapshotData(params: {
  html: string;
  targetType: DiscoveredTarget['targetType'];
}): SubmissionMonitoringBaseline {
  const { html, targetType } = params;
  const ogTitle = extractMetaContent(html, 'og:title');
  const ogImage = extractMetaContent(html, 'og:image');
  const description =
    extractMetaContent(html, 'og:description') ??
    extractMetaContent(html, 'description');
  const jsonLdName = extractJsonLdValue(html, 'name');
  const jsonLdArtistName = extractJsonLdArtistName(html);
  const published = extractJsonLdValue(html, 'datePublished');

  if (targetType === 'allmusic_release_page') {
    return {
      artistName:
        jsonLdArtistName ??
        extractArtistNameFromOgTitle({ ogTitle, targetType }) ??
        undefined,
      releaseTitle:
        jsonLdName ?? extractReleaseTitleFromOgTitle(ogTitle) ?? undefined,
      releaseDate: published?.slice(0, 10) ?? undefined,
      upc: extractUpc(html) ?? undefined,
      trackCount: extractTrackCount(html) ?? undefined,
      hasCredits: /credits/i.test(html),
      hasArtwork: Boolean(ogImage),
    };
  }

  return {
    artistName:
      jsonLdName ??
      extractArtistNameFromOgTitle({ ogTitle, targetType }) ??
      undefined,
    hasBio: Boolean(description),
    hasArtistImage: Boolean(ogImage),
  };
}

async function snapshotAllMusicUrl(
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

  return {
    targetType: target.targetType,
    canonicalUrl: target.canonicalUrl,
    normalizedData: parseAllMusicSnapshotData({
      html,
      targetType: target.targetType,
    }),
  };
}

function isMatchingAllMusicTarget(params: {
  canonical: CanonicalSubmissionContext;
  targetType: DiscoveredTarget['targetType'];
  snapshot: ProviderSnapshot;
}): boolean {
  const { canonical, targetType, snapshot } = params;

  if (targetType === 'allmusic_artist_page') {
    return matchesCanonicalValue(
      snapshot.normalizedData.artistName,
      canonical.artistName
    );
  }

  if (!canonical.release) {
    return false;
  }

  const titleMatches = matchesCanonicalValue(
    snapshot.normalizedData.releaseTitle,
    canonical.release.title
  );

  if (!titleMatches) {
    return false;
  }

  if (!snapshot.normalizedData.artistName) {
    return true;
  }

  return matchesCanonicalValue(
    snapshot.normalizedData.artistName,
    canonical.artistName
  );
}

async function resolveMatchingTarget(params: {
  canonical: CanonicalSubmissionContext;
  targetType: DiscoveredTarget['targetType'];
  candidateUrls: string[];
}): Promise<DiscoveredTarget | null> {
  for (const canonicalUrl of params.candidateUrls.slice(0, 5)) {
    const target: DiscoveredTarget = {
      targetType: params.targetType,
      canonicalUrl,
    };
    const snapshot = await snapshotAllMusicUrl(target);

    if (
      snapshot &&
      isMatchingAllMusicTarget({
        canonical: params.canonical,
        targetType: params.targetType,
        snapshot,
      })
    ) {
      return target;
    }
  }

  return null;
}

export async function discoverAllMusicTargets(
  canonical: CanonicalSubmissionContext
): Promise<DiscoveredTarget[]> {
  const discovered: DiscoveredTarget[] = [];
  const artistName = encodeURIComponent(canonical.artistName);
  const artistSearchUrl = `https://www.allmusic.com/search/artists/${artistName}`;
  const albumSearchRequest = canonical.release
    ? serverFetch(
        `https://www.allmusic.com/search/albums/${artistName}%20${encodeURIComponent(canonical.release.title)}`,
        {
          context: 'AllMusic album search',
          timeoutMs: 8_000,
          retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
        }
      )
    : Promise.resolve(null);

  const [albumResponse, artistResponse] = await Promise.all([
    albumSearchRequest,
    serverFetch(artistSearchUrl, {
      context: 'AllMusic artist search',
      timeoutMs: 8_000,
      retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
    }),
  ]);

  const [albumHtml, artistHtml] = await Promise.all([
    albumResponse?.ok ? albumResponse.text() : Promise.resolve(''),
    artistResponse.ok ? artistResponse.text() : Promise.resolve(''),
  ]);

  if (canonical.release) {
    const releaseTarget = await resolveMatchingTarget({
      canonical,
      targetType: 'allmusic_release_page',
      candidateUrls: collectResultUrls(albumHtml).filter(url =>
        url.includes('/album/')
      ),
    });

    if (releaseTarget) {
      discovered.push(releaseTarget);
    }
  }

  const artistTarget = await resolveMatchingTarget({
    canonical,
    targetType: 'allmusic_artist_page',
    candidateUrls: collectResultUrls(artistHtml).filter(url =>
      url.includes('/artist/')
    ),
  });

  if (artistTarget) {
    discovered.push(artistTarget);
  }

  return discovered;
}

export async function snapshotAllMusicTarget(
  _canonical: CanonicalSubmissionContext,
  target: DiscoveredTarget
): Promise<ProviderSnapshot | null> {
  return snapshotAllMusicUrl(target);
}
