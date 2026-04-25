/**
 * SSRF-safe HTML fetcher for arbitrary user-supplied URLs.
 *
 * Composes existing safety primitives (isSafeExternalHttpsUrl, isPrivateHostname)
 * with manual redirect handling so every hop is re-validated against the
 * literal-host gate AND the DNS-resolved-host gate. This is the only place in
 * the chat tool surface that touches the network for user-named URLs.
 *
 * Existing ingestion callers continue to use fetchDocument() with their
 * per-platform allowlists. They are unaffected.
 */

import { isPrivateHostname } from '@/lib/ingestion/avatar/network-safety';
import { isSafeExternalHttpsUrl } from '@/lib/ingestion/flows/avatar-hosting';
import { logger } from '@/lib/utils/logger';
import { sanitizeText } from './extract-bio-candidate';

const TITLE_MAX_LENGTH = 120;

export type SafeFetchError =
  | 'invalid_url'
  | 'blocked_host'
  | 'auth_walled'
  | 'not_html'
  | 'too_large'
  | 'timeout'
  | 'fetch_failed';

export interface SafeFetchSuccess {
  ok: true;
  html: string;
  finalUrl: string;
  sourceTitle?: string;
}

export interface SafeFetchFailure {
  ok: false;
  error: SafeFetchError;
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024; // 512 KiB
const MAX_REDIRECTS = 3;

const ALLOWED_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'] as const;

// Hosts that strongly indicate a login wall is being shown rather than the
// user's real page. Conservative list — false positives cost the user nothing
// (they see "I couldn't read that, paste it") but false negatives let an auth
// page's <meta description> ride through as a "bio".
const AUTH_WALL_HOST_FRAGMENTS = [
  'clerk.accounts.dev',
  'clerk.com',
  'auth0.com',
  'login.microsoftonline.com',
  'accounts.google.com',
  'login.live.com',
  'login.salesforce.com',
];

interface ValidatedUrl {
  ok: true;
  url: URL;
}

async function validateUrlForFetch(
  rawUrl: string
): Promise<ValidatedUrl | SafeFetchFailure> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: 'invalid_url' };
  }

  // Reject userinfo (https://evil.com@10.0.0.1/), trailing-dot hostnames,
  // and IPv6 zone identifiers. Also reject empty paths to keep the
  // contract narrow.
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'invalid_url' };
  }
  if (parsed.hostname.endsWith('.')) {
    return { ok: false, error: 'invalid_url' };
  }

  // Literal-host gate (synchronous, covers private IP literals, blocked
  // hostnames, internal suffixes, metadata hosts, IPv6 link-local).
  if (!isSafeExternalHttpsUrl(parsed.toString())) {
    return { ok: false, error: 'blocked_host' };
  }

  // DNS-resolved gate. Also catches a public-looking hostname that resolves
  // to a private IP (e.g., 127.0.0.1.nip.io style tricks) at validation time.
  // Re-checked on every redirect hop to mitigate rebinding within the small
  // TOCTOU window before fetch.
  if (await isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: 'blocked_host' };
  }

  return { ok: true, url: parsed };
}

function isAuthWallResponse(response: Response): boolean {
  if (response.status === 401 || response.status === 403) return true;
  if (response.headers.get('www-authenticate')) return true;
  return false;
}

function isAuthWallRedirectTarget(targetUrl: URL): boolean {
  const host = targetUrl.hostname.toLowerCase();
  return AUTH_WALL_HOST_FRAGMENTS.some(fragment => host.includes(fragment));
}

function extractTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  if (!match?.[1]) return undefined;
  // Route title through the same defense pipeline as bio text: strip URLs,
  // control chars, zero-width chars, then cap. The confirmation card displays
  // this string to the user, so attacker-controlled `<title>BUY $XYZ at
  // evil.com</title>` should not ride through unchanged.
  const sanitized = sanitizeText(match[1], TITLE_MAX_LENGTH);
  return sanitized || undefined;
}

async function readBodyWithCap(response: Response): Promise<string | null> {
  const contentLength = response.headers.get('content-length');
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > MAX_BYTES) {
      return null;
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > MAX_BYTES ? null : text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // Decode using charset from Content-Type when present, default UTF-8.
  const contentType = response.headers.get('content-type') ?? '';
  const charsetMatch = /charset=([^;]+)/i.exec(contentType);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() ?? 'utf-8';
  try {
    return new TextDecoder(charset, { fatal: false }).decode(merged);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(merged);
  }
}

function classifyContentType(response: Response): SafeFetchError | null {
  const contentType =
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ??
    '';
  if (!contentType) return 'not_html';
  if (!ALLOWED_CONTENT_TYPES.some(allowed => contentType === allowed)) {
    return 'not_html';
  }
  return null;
}

/**
 * Fetch HTML from a user-supplied URL with SSRF, size, and content-type guards.
 *
 * Returns a discriminated union. Callers should never rethrow on `ok: false`,
 * just surface the typed error to the model so it falls back to "paste it".
 */
export async function safeFetchPublicHtml(
  rawUrl: string
): Promise<SafeFetchResult> {
  const initialValidation = await validateUrlForFetch(rawUrl);
  if (!initialValidation.ok) return initialValidation;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let currentUrl = initialValidation.url;
  let redirects = 0;

  try {
    while (true) {
      let response: Response;
      try {
        response = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'user-agent': 'Jovie-BioImport/1.0',
            accept: 'text/html,application/xhtml+xml',
          },
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return { ok: false, error: 'timeout' };
        }
        logger.warn('safeFetchPublicHtml: fetch failed', {
          url: currentUrl.toString(),
          error,
        });
        return { ok: false, error: 'fetch_failed' };
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { ok: false, error: 'fetch_failed' };
        }
        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          return { ok: false, error: 'fetch_failed' };
        }

        if (isAuthWallRedirectTarget(nextUrl)) {
          return { ok: false, error: 'auth_walled' };
        }

        redirects++;
        if (redirects > MAX_REDIRECTS) {
          return { ok: false, error: 'fetch_failed' };
        }

        // Re-run the full validation pipeline on the redirect target. This
        // is the DNS-rebinding mitigation: every hop is re-resolved.
        const hopValidation = await validateUrlForFetch(nextUrl.toString());
        if (!hopValidation.ok) return hopValidation;
        currentUrl = hopValidation.url;
        continue;
      }

      if (isAuthWallResponse(response)) {
        return { ok: false, error: 'auth_walled' };
      }

      if (!response.ok) {
        return { ok: false, error: 'fetch_failed' };
      }

      const contentTypeError = classifyContentType(response);
      if (contentTypeError) {
        return { ok: false, error: contentTypeError };
      }

      const html = await readBodyWithCap(response);
      if (html === null) {
        return { ok: false, error: 'too_large' };
      }
      if (html.trim().length === 0) {
        return { ok: false, error: 'fetch_failed' };
      }

      return {
        ok: true,
        html,
        finalUrl: currentUrl.toString(),
        sourceTitle: extractTitle(html),
      };
    }
  } finally {
    clearTimeout(timeoutHandle);
  }
}
