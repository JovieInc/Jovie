/**
 * TikTok Profile Ingestion Strategy
 *
 * TikTok renders profiles client-side; public fields live in the
 * `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON. OpenGraph tags are a fallback.
 */

import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
  extractScriptJson,
  type FetchOptions,
  fetchDocument,
  isUrlSafe,
  isValidHandle,
  normalizeHandle,
  type StrategyConfig,
} from './base';

const TIKTOK_CONFIG: StrategyConfig = {
  platformId: 'tiktok',
  platformName: 'TikTok',
  canonicalHost: 'www.tiktok.com',
  validHosts: new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']),
  defaultTimeoutMs: 10000,
} as const;

const SKIP_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']);

function extractHandleFromPath(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const rawHandle = parts[0]?.replace(/^@/, '') ?? '';
  if (!rawHandle || !isValidHandle(rawHandle)) return null;
  return normalizeHandle(rawHandle);
}

export function validateTikTokUrl(url: string): string | null {
  if (!isUrlSafe(url)) return null;
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);
    if (!TIKTOK_CONFIG.validHosts.has(parsed.hostname.toLowerCase())) {
      return null;
    }
    const handle = extractHandleFromPath(parsed.pathname);
    if (!handle) return null;
    return `https://${TIKTOK_CONFIG.canonicalHost}/@${handle}`;
  } catch {
    return null;
  }
}

export function isTikTokUrl(url: string): boolean {
  return Boolean(validateTikTokUrl(url));
}

export function extractTikTokHandle(url: string): string | null {
  const validated = validateTikTokUrl(url);
  if (!validated) return null;
  const parsed = new URL(validated);
  const handle = parsed.pathname.split('/').find(Boolean) ?? '';
  return handle.replace(/^@/, '') || null;
}

export async function fetchTikTokDocument(
  sourceUrl: string,
  options?: FetchOptions
): Promise<string> {
  const validated = validateTikTokUrl(sourceUrl);
  if (!validated) {
    throw new ExtractionError('Invalid TikTok profile URL', 'INVALID_URL');
  }

  const { html } = await fetchDocument(validated, {
    ...options,
    timeoutMs: TIKTOK_CONFIG.defaultTimeoutMs,
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      ...options?.headers,
    },
    allowedHosts: TIKTOK_CONFIG.validHosts,
  });

  return html;
}

interface TikTokUserDetail {
  readonly statusCode?: number;
  readonly userInfo?: {
    readonly user?: {
      readonly nickname?: unknown;
      readonly signature?: unknown;
      readonly avatarLarger?: unknown;
      readonly avatarMedium?: unknown;
      readonly bioLink?: { readonly link?: unknown };
    };
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** The profile slice of TikTok's rehydration payload, if the page has one. */
function rehydratedUser(html: string) {
  const data = extractScriptJson<{
    __DEFAULT_SCOPE__?: Record<string, TikTokUserDetail>;
  }>(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__');
  const detail = data?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
  if (!detail) return null;
  // 0 is a served profile; anything else is missing, private, or banned.
  if (detail.statusCode !== undefined && detail.statusCode !== 0) {
    throw new ExtractionError('TikTok profile not found', 'NOT_FOUND', 404);
  }
  return detail.userInfo?.user ?? null;
}

/** The one external link TikTok shows under the bio. */
function bioLinkEntry(
  raw: string | null
): ExtractionResult['links'][number] | null {
  if (!raw) return null;
  try {
    const detected = detectPlatform(
      normalizeUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    );
    if (!detected.isValid) return null;
    return {
      url: detected.normalizedUrl,
      platformId: detected.platform.id,
      title: detected.suggestedTitle,
      sourcePlatform: 'tiktok',
      evidence: {
        sources: ['tiktok_profile'],
        signals: ['tiktok_profile_link'],
      },
    };
  } catch {
    return null;
  }
}

export function extractTikTok(html: string): ExtractionResult {
  const user = rehydratedUser(html);
  const ogProfile = extractOpenGraphProfile(html);
  const displayName = text(user?.nickname) ?? ogProfile.displayName;
  const avatarUrl =
    text(user?.avatarLarger) ?? text(user?.avatarMedium) ?? ogProfile.avatarUrl;
  const bio =
    text(user?.signature) ?? text(extractMetaContent(html, 'og:description'));

  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'tiktok',
    sourceSignal: 'tiktok_profile_link',
  });
  const bioLink = bioLinkEntry(text(user?.bioLink?.link));
  if (bioLink && !links.some(link => link.url === bioLink.url)) {
    links.push(bioLink);
  }

  // A 200 with nothing in it is a bot wall, not a creator with no data.
  if (!displayName && !avatarUrl && !bio && links.length === 0) {
    throw new ExtractionError(
      'TikTok served no public profile data',
      'EMPTY_RESPONSE'
    );
  }

  return {
    ...createExtractionResult(links, displayName, avatarUrl),
    sourcePlatform: 'tiktok',
    bio,
  };
}
