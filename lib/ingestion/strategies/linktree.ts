import { detectPlatform, normalizeUrl } from '@/lib/utils/platform-detection';
import { type ExtractionResult } from '../types';

// Strict allowlist of valid Linktree hostnames
const LINKTREE_HOSTS = new Set([
  'linktr.ee',
  'www.linktr.ee',
  'linktree.com',
  'www.linktree.com',
]);

const HREF_REGEX = /href\s*=\s*"([^"#]+)"/gi;

// Handle validation: 3-30 chars, alphanumeric + underscores, no leading/trailing special chars
const HANDLE_REGEX = /^[a-z0-9][a-z0-9_]{1,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

function extractMetaContent(html: string, property: string): string | null {
  const metaRegex = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const match = html.match(metaRegex);
  if (match?.[1]) return match[1].trim();

  const nameRegex = new RegExp(
    `<meta[^>]+name=["']${property}["'][^>]*content=["']([^"']+)["']`,
    'i'
  );
  const nameMatch = html.match(nameRegex);
  return nameMatch?.[1]?.trim() ?? null;
}

/**
 * Validates that a URL is a valid Linktree profile URL.
 * Strict validation: must be https, valid host, and have a handle path.
 */
export function isLinktreeUrl(url: string): boolean {
  try {
    const parsed = new URL(normalizeUrl(url));

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // Must be a valid Linktree host
    if (!LINKTREE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false;
    }

    // Must have a handle in the path (not just root)
    const handle = extractLinktreeHandle(url);
    return handle !== null && handle.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validates and normalizes a Linktree URL.
 * Returns null if invalid.
 */
export function validateLinktreeUrl(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') {
      return null;
    }

    // Must be a valid Linktree host
    if (!LINKTREE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    // Extract and validate handle
    const handle = extractLinktreeHandle(normalized);
    if (!handle || !isValidHandle(handle)) {
      return null;
    }

    // Return canonical URL format
    return `https://linktr.ee/${handle}`;
  } catch {
    return null;
  }
}

/**
 * Validates a handle format.
 */
export function isValidHandle(handle: string): boolean {
  if (!handle || handle.length < 1 || handle.length > 30) {
    return false;
  }
  const normalized = handle.toLowerCase();
  return HANDLE_REGEX.test(normalized);
}

export async function fetchLinktreeDocument(
  sourceUrl: string,
  timeoutMs = 8000
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(normalizeUrl(sourceUrl), {
      signal: controller.signal,
      headers: {
        'user-agent': 'jovie-link-ingestion/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Linktree fetch failed with status ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function extractLinktree(
  html: string,
  sourceUrl?: string
): ExtractionResult {
  void sourceUrl;
  const links: ExtractionResult['links'] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = HREF_REGEX.exec(html)) !== null) {
    const rawHref = match[1];
    if (!rawHref || rawHref.startsWith('#')) continue;
    if (!/^https?:\/\//i.test(rawHref)) continue;

    const normalizedHref = normalizeUrl(rawHref);
    try {
      const parsed = new URL(normalizedHref);
      if (LINKTREE_HOSTS.has(parsed.hostname.toLowerCase())) {
        continue; // Skip internal Linktree navigation links
      }
    } catch {
      continue;
    }

    const detected = detectPlatform(normalizedHref);
    if (!detected.isValid) continue;

    const key = `${detected.platform.id}:${detected.normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    links.push({
      url: detected.normalizedUrl,
      platformId: detected.platform.id,
      title: detected.suggestedTitle,
      sourcePlatform: 'linktree',
      evidence: {
        sources: ['linktree'],
        signals: ['linktree_profile_link'],
      },
    });
  }

  const displayName =
    extractMetaContent(html, 'og:title') ??
    extractMetaContent(html, 'twitter:title') ??
    null;
  const avatarUrl =
    extractMetaContent(html, 'og:image') ??
    extractMetaContent(html, 'twitter:image') ??
    null;

  return {
    links,
    displayName,
    avatarUrl,
  };
}

/**
 * Extracts and normalizes the handle from a Linktree URL.
 * Returns lowercase handle with @ prefix and trailing slashes stripped.
 */
export function extractLinktreeHandle(url: string): string | null {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);
    if (!LINKTREE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    // Normalize: lowercase, strip @ prefix
    const rawHandle = parts[0].replace(/^@/, '').toLowerCase();

    // Validate handle format
    if (!isValidHandle(rawHandle)) {
      return null;
    }

    return rawHandle;
  } catch {
    return null;
  }
}

/**
 * Normalizes a handle for storage (usernameNormalized).
 * Lowercase, strip @ prefix, trim whitespace.
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '');
}
