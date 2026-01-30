import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  ExtractionError,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
  validatePlatformUrl,
} from './base';

const YOUTUBE_CONFIG: StrategyConfig = {
  platformId: 'youtube',
  platformName: 'YouTube',
  canonicalHost: 'www.youtube.com',
  validHosts: new Set(['youtube.com', 'www.youtube.com']),
  defaultTimeoutMs: 10000,
} as const;

const CHANNEL_PATTERNS = [
  /^https?:\/\/(www\.)?youtube\.com\/channel\/[^/?#]+/i,
  /^https?:\/\/(www\.)?youtube\.com\/c\/[^/?#]+/i,
  /^https?:\/\/(www\.)?youtube\.com\/@[^/?#]+/i,
];
const MAX_URL_LENGTH = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPath(value: unknown, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return current;
}

export function isYouTubeChannelUrl(url: string): boolean {
  try {
    if (url.length > MAX_URL_LENGTH) {
      return false;
    }
    const normalized = normalizeUrl(url);
    return CHANNEL_PATTERNS.some(rx => rx.test(normalized));
  } catch {
    return false;
  }
}

export function validateYouTubeChannelUrl(url: string): string | null {
  try {
    if (url.length > MAX_URL_LENGTH) {
      return null;
    }
    const candidate = normalizeUrl(url);
    if (!CHANNEL_PATTERNS.some(rx => rx.test(candidate))) {
      return null;
    }
    const aboutUrl = candidate.endsWith('/about')
      ? candidate
      : `${candidate.replace(/\/+$/, '')}/about`;
    const result = validatePlatformUrl(aboutUrl, YOUTUBE_CONFIG);
    return result.valid && result.normalized ? result.normalized : null;
  } catch {
    return null;
  }
}

export function extractYouTubeHandle(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    const first = parts[0];
    if (first.startsWith('@')) return first.slice(1).toLowerCase();
    if (first === 'channel' && parts[1]) return parts[1].toLowerCase();
    if (first === 'c' && parts[1]) return parts[1].toLowerCase();
    return null;
  } catch {
    return null;
  }
}

export async function fetchYouTubeAboutDocument(
  sourceUrl: string,
  options?: FetchOptions
): Promise<string> {
  const validated = validateYouTubeChannelUrl(sourceUrl);
  if (!validated) {
    throw new ExtractionError('Invalid YouTube channel URL', 'INVALID_URL');
  }
  const result = await fetchDocument(validated, {
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      ...(options?.headers ?? {}),
    },
    allowedHosts: YOUTUBE_CONFIG.validHosts,
  });
  return result.html;
}

function parseChannelJson(html: string): unknown {
  const data =
    extractScriptJson<unknown>(html, 'ytInitialData') ??
    extractScriptJson<unknown>(html, 'ytInitialPlayerResponse');
  return data ?? null;
}

function extractLinksFromAbout(data: unknown): string[] {
  try {
    const tabs = getPath(data, [
      'contents',
      'twoColumnBrowseResultsRenderer',
      'tabs',
    ]);
    const tabArray = Array.isArray(tabs) ? tabs : [];

    const aboutTab =
      (tabArray.find(
        t => getPath(t, ['tabRenderer', 'title']) === 'About'
      ) as unknown) ??
      (tabArray.find(t =>
        Boolean(getPath(t, ['tabRenderer', 'selected']))
      ) as unknown) ??
      null;

    const tabRenderer = aboutTab ? getPath(aboutTab, ['tabRenderer']) : null;
    const aboutRenderer = getPath(tabRenderer, [
      'content',
      'sectionListRenderer',
      'contents',
      '0',
      'itemSectionRenderer',
      'contents',
      '0',
      'channelAboutFullMetadataRenderer',
    ]);

    const linksRaw = getPath(aboutRenderer, ['links']);
    const linksArray = Array.isArray(linksRaw) ? linksRaw : [];
    const urls: string[] = [];
    for (const linkItem of linksArray) {
      const href =
        getPath(linkItem, ['channelExternalLinkViewModel', 'link', 'href']) ??
        getPath(linkItem, ['channelExternalLinkViewModel', 'link', 'uri']) ??
        getPath(linkItem, ['navigationEndpoint', 'urlEndpoint', 'url']);
      if (typeof href === 'string') {
        urls.push(href);
      }
    }

    return urls;
  } catch {
    return [];
  }
}

function extractDisplayName(data: unknown): string | null {
  try {
    const microTitle = getPath(data, [
      'microformat',
      'microformatDataRenderer',
      'title',
    ]);
    if (typeof microTitle === 'string' && microTitle.trim().length > 0) {
      return microTitle;
    }

    const metaTitle =
      getPath(data, ['metadata', 'channelMetadataRenderer', 'title']) ??
      getPath(data, ['header', 'c4TabbedHeaderRenderer', 'title']);

    return typeof metaTitle === 'string' && metaTitle.trim().length > 0
      ? metaTitle
      : null;
  } catch {
    return null;
  }
}

function extractAvatar(data: unknown): string | null {
  try {
    const headerThumbnails = getPath(data, [
      'header',
      'c4TabbedHeaderRenderer',
      'avatar',
      'thumbnails',
    ]);
    const microThumbnails = getPath(data, [
      'microformat',
      'microformatDataRenderer',
      'thumbnail',
      'thumbnails',
    ]);
    const thumbnails =
      (Array.isArray(headerThumbnails) && headerThumbnails) ||
      (Array.isArray(microThumbnails) && microThumbnails) ||
      [];

    const best =
      thumbnails.length > 0 ? thumbnails[thumbnails.length - 1] : null;
    const url = best ? getPath(best, ['url']) : null;
    return typeof url === 'string' ? url : null;
  } catch {
    return null;
  }
}

function isOfficialArtist(data: unknown): boolean {
  try {
    const badgesHeader = getPath(data, [
      'header',
      'c4TabbedHeaderRenderer',
      'badges',
    ]);
    const badgesMeta = getPath(data, [
      'metadata',
      'channelMetadataRenderer',
      'ownerBadges',
    ]);
    const badges =
      (Array.isArray(badgesHeader) && badgesHeader) ||
      (Array.isArray(badgesMeta) && badgesMeta) ||
      [];

    return badges.some(badge =>
      JSON.stringify(badge).includes('OFFICIAL_ARTIST_BADGE')
    );
  } catch {
    return false;
  }
}

export function extractYouTube(html: string): ExtractionResult {
  const data = parseChannelJson(html);
  const links: ExtractionResult['links'] = [];
  const rawLinks = extractLinksFromAbout(data);
  const official = isOfficialArtist(data);

  for (const raw of rawLinks) {
    try {
      const normalized = normalizeUrl(raw);
      const detected = detectPlatform(normalized);
      if (!detected.isValid) continue;
      links.push({
        url: detected.normalizedUrl,
        platformId: detected.platform.id,
        title: detected.suggestedTitle,
        sourcePlatform: 'youtube',
        evidence: {
          sources: ['youtube_about'],
          signals: [
            'youtube_about_link',
            ...(official ? ['youtube_official_artist'] : []),
          ],
        },
      });
    } catch {
      continue;
    }
  }

  const displayName = extractDisplayName(data);
  const avatarUrl = extractAvatar(data);

  return {
    links,
    displayName,
    avatarUrl,
    sourcePlatform: 'youtube',
  };
}
