/**
 * TikTok Profile Ingestion Strategy
 *
 * Lightweight metadata-first extraction using OpenGraph tags.
 */

import { normalizeUrl } from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  createExtractionResult,
  ExtractionError,
  extractLinks,
  extractMetaContent,
  extractOpenGraphProfile,
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
  const handle = parsed.pathname.split('/').filter(Boolean)[0] ?? '';
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
      ...(options?.headers ?? {}),
    },
    allowedHosts: TIKTOK_CONFIG.validHosts,
  });

  return html;
}

export function extractTikTok(html: string): ExtractionResult {
  const ogProfile = extractOpenGraphProfile(html);
  const bio = extractMetaContent(html, 'og:description') ?? null;

  const links = extractLinks(html, {
    skipHosts: SKIP_HOSTS,
    sourcePlatform: 'tiktok',
    sourceSignal: 'tiktok_profile_link',
  });

  return {
    ...createExtractionResult(
      links,
      ogProfile.displayName,
      ogProfile.avatarUrl
    ),
    sourcePlatform: 'tiktok',
    bio: bio?.trim() || null,
  };
}
