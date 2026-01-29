import {
  canonicalIdentity,
  detectPlatform,
  normalizeUrl,
} from '@/lib/utils/platform-detection';
import type { ExtractionResult } from '../types';
import {
  ExtractionError,
  type FetchOptions,
  fetchDocument,
  normalizeHandle,
  stripTrackingParams,
  validatePlatformUrl,
} from './base';

const LAYLO_CONFIG = {
  platformId: 'laylo',
  platformName: 'Laylo',
  canonicalHost: 'laylo.com',
  validHosts: new Set(['laylo.com', 'www.laylo.com']),
  defaultTimeoutMs: 10000,
} as const;

export function isLayloUrl(url: string): boolean {
  return validatePlatformUrl(url, LAYLO_CONFIG).valid;
}

export function validateLayloUrl(url: string): string | null {
  const result = validatePlatformUrl(url, LAYLO_CONFIG);
  return result.valid && result.normalized ? result.normalized : null;
}

export function extractLayloHandle(url: string): string | null {
  const result = validatePlatformUrl(url, LAYLO_CONFIG);
  return result.valid && result.handle ? result.handle : null;
}

export function normalizeLayloHandle(handle: string): string {
  return normalizeHandle(handle);
}

async function fetchJson<T>(url: string, options?: FetchOptions): Promise<T> {
  const { html } = await fetchDocument(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
    allowedHosts: LAYLO_CONFIG.validHosts,
  });
  try {
    return JSON.parse(html) as T;
  } catch (error) {
    throw new ExtractionError(
      'Failed to parse Laylo JSON',
      'PARSE_ERROR',
      500,
      error
    );
  }
}

type LayloProfileJson = {
  user: { id: string; username?: string } | null;
  appearance?: { font?: string; color?: string };
  gallery?: { url?: string | null }[];
};

type LayloUserJson = {
  displayName?: string;
  imageUrl?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
  spotify?: string | null;
  twitch?: string | null;
  store?: string | null;
  website?: string | null;
  soundcloud?: string | null;
};

export async function fetchLayloProfile(handle: string): Promise<{
  profile: LayloProfileJson;
  user: LayloUserJson | null;
}> {
  const sanitizedHandle = handle.replace(/^@/, '').toLowerCase();
  const profileUrl = `https://d21i0hc4hl3bvt.cloudfront.net/${sanitizedHandle}/profile.json`;
  const profile = await fetchJson<LayloProfileJson>(profileUrl, {
    timeoutMs: LAYLO_CONFIG.defaultTimeoutMs,
  });

  const userId = profile.user?.id;
  if (!userId) {
    return { profile, user: null };
  }

  const userUrl = `https://d3oyaxbt9vo0fg.cloudfront.net/users/${userId}.json`;
  try {
    const user = await fetchJson<LayloUserJson>(userUrl, {
      timeoutMs: LAYLO_CONFIG.defaultTimeoutMs,
    });
    return { profile, user };
  } catch {
    return { profile, user: null };
  }
}

export function extractLaylo(
  profile: LayloProfileJson,
  user: LayloUserJson | null
): ExtractionResult {
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();
  const socialFields: Array<{ key: keyof LayloUserJson; url?: string | null }> =
    [
      { key: 'instagram', url: user?.instagram },
      { key: 'twitter', url: user?.twitter },
      { key: 'facebook', url: user?.facebook },
      { key: 'tiktok', url: user?.tiktok },
      { key: 'youtube', url: user?.youtube },
      { key: 'spotify', url: user?.spotify },
      { key: 'twitch', url: user?.twitch },
      { key: 'store', url: user?.store },
      { key: 'website', url: user?.website },
      { key: 'soundcloud', url: user?.soundcloud },
    ];

  for (const entry of socialFields) {
    if (!entry.url) continue;
    const normalizedUrl = stripTrackingParams(normalizeUrl(entry.url));
    const detected = detectPlatform(normalizedUrl);
    if (!detected.isValid) continue;

    const canonical = canonicalIdentity({
      platform: detected.platform,
      normalizedUrl: detected.normalizedUrl,
    });
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    links.push({
      url: detected.normalizedUrl,
      platformId: detected.platform.id,
      title: detected.suggestedTitle,
      sourcePlatform: 'laylo',
      evidence: {
        sources: ['laylo'],
        signals: ['laylo_profile_link', canonical],
      },
    });
  }

  // Also store the Laylo profile URL itself
  const layloUrl = profile.user?.username
    ? `https://laylo.com/${profile.user.username}`
    : null;
  if (layloUrl && isLayloUrl(layloUrl)) {
    const normalized = normalizeUrl(layloUrl);
    const canonical = canonicalIdentity({
      platform: detectPlatform(normalized).platform,
      normalizedUrl: normalized,
    });
    if (!seen.has(canonical)) {
      seen.add(canonical);
      links.push({
        url: normalized,
        sourcePlatform: 'laylo',
        evidence: {
          sources: ['laylo'],
          signals: ['laylo_profile_link'],
        },
      });
    }
  }

  const avatarUrl =
    user?.imageUrl?.trim() ||
    profile.gallery?.find(item => item.url)?.url ||
    null;

  const displayName =
    (user?.displayName || profile.user?.username || '').trim() || null;

  return {
    links,
    displayName,
    avatarUrl,
    sourcePlatform: 'laylo',
  };
}
