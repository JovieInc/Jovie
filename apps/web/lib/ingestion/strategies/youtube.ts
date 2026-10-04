import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  ExtractionError,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  type StrategyConfig,
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
/** First path segment(s) that identify a channel; any trailing tab is ignored. */
const CHANNEL_PATH = /^\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+)(?:\/[^?#]*)?$/i;
/** Channel /about pages run about 2.5 MB of inline JSON. */
const YOUTUBE_MAX_RESPONSE_BYTES = 6_000_000;

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

/**
 * Canonical `https://www.youtube.com/<channel>/about` URL, or null.
 *
 * Idempotent: the result validates to itself. The generic platform validator
 * rewrites `/@handle` to `/handle` and `/channel/<id>` to `/channel`, which
 * YouTube does not serve, so channel identity is kept from the path here.
 */
export function validateYouTubeChannelUrl(url: string): string | null {
  try {
    if (url.length > MAX_URL_LENGTH) {
      return null;
    }
    const parsed = new URL(normalizeUrl(url));
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      !YOUTUBE_CONFIG.validHosts.has(parsed.hostname.toLowerCase())
    ) {
      return null;
    }
    const channel = CHANNEL_PATH.exec(parsed.pathname)?.[1];
    return channel
      ? `https://${YOUTUBE_CONFIG.canonicalHost}/${channel}/about`
      : null;
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
      ...options?.headers,
    },
    allowedHosts: YOUTUBE_CONFIG.validHosts,
    maxResponseBytes: options?.maxResponseBytes ?? YOUTUBE_MAX_RESPONSE_BYTES,
  });
  return result.html;
}

/**
 * Read `var ytInitialData = {...};` the way YouTube actually ships it: an
 * assignment in an inline script, not a script tag with that id.
 */
export function extractAssignedJson(
  html: string,
  name: string
): unknown | null {
  const marker = new RegExp(
    `(?:var\\s+|window\\[["']|window\\.)${name}(?:["']\\])?\\s*=\\s*\\{`
  ).exec(html);
  if (!marker) return null;
  const start = marker.index + marker[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index++) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, index + 1)) as unknown;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseChannelJson(html: string): unknown {
  const data =
    extractScriptJson<unknown>(html, 'ytInitialData') ??
    extractAssignedJson(html, 'ytInitialData') ??
    extractScriptJson<unknown>(html, 'ytInitialPlayerResponse');
  return data ?? null;
}

/** Every object stored under `key`, anywhere in the tree (bounded depth). */
function findAll(value: unknown, key: string, depth = 0, out: unknown[] = []) {
  if (depth > 40 || !isRecord(value)) return out;
  for (const [entryKey, entry] of Object.entries(value)) {
    if (entryKey === key) out.push(entry);
    findAll(entry, key, depth + 1, out);
  }
  return out;
}

/** youtube.com/redirect?q=<target> wraps every outbound About link. */
function unwrapRedirect(href: string): string {
  try {
    const parsed = new URL(href, 'https://www.youtube.com');
    if (
      YOUTUBE_CONFIG.validHosts.has(parsed.hostname) &&
      parsed.pathname === '/redirect'
    ) {
      return parsed.searchParams.get('q') ?? href;
    }
  } catch {
    // Fall through to the raw value.
  }
  return href;
}

/** Links from the current About panel (`aboutChannelViewModel`). */
function extractLinksFromViewModels(data: unknown): string[] {
  const urls: string[] = [];
  for (const model of findAll(data, 'channelExternalLinkViewModel')) {
    const target =
      getPath(model, [
        'link',
        'commandRuns',
        '0',
        'onTap',
        'innertubeCommand',
        'urlEndpoint',
        'url',
      ]) ?? getPath(model, ['link', 'content']);
    if (typeof target !== 'string' || !target.trim()) continue;
    const href = unwrapRedirect(target.trim());
    urls.push(/^https?:\/\//i.test(href) ? href : `https://${href}`);
  }
  return [...new Set(urls)];
}

function extractBio(data: unknown): string | null {
  const about = findAll(data, 'aboutChannelViewModel')[0];
  const description =
    getPath(about, ['description']) ??
    getPath(data, ['metadata', 'channelMetadataRenderer', 'description']);
  return typeof description === 'string' && description.trim()
    ? description.trim()
    : null;
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

    const best = thumbnails.at(-1) ?? null;
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
  const legacyLinks = extractLinksFromAbout(data);
  const rawLinks = legacyLinks.length
    ? legacyLinks
    : extractLinksFromViewModels(data);
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
    bio: extractBio(data),
    sourcePlatform: 'youtube',
  };
}
