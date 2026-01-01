/**
 * Fetch Utilities
 *
 * Document fetching with timeout, retries, and proper error handling.
 */

import { logger } from '@/lib/utils/logger';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  MAX_REDIRECTS,
  RETRY_DELAY_MS,
} from './constants';
import type { FetchOptions, FetchResult } from './types';
import { ExtractionError } from './types';
import { sleep } from './utils';

/**
 * Fetches a document with timeout, retries, and proper error handling.
 * Designed for server-side use with AbortController.
 */
export async function fetchDocument(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    userAgent = DEFAULT_USER_AGENT,
    headers = {},
    allowedHosts,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = options;

  const normalizedUrl = normalizeUrl(url);
  let lastError: Error | null = null;

  const normalizeAndValidate = (candidateUrl: string): string => {
    const parsed = new URL(candidateUrl);
    if (parsed.protocol !== 'https:') {
      throw new ExtractionError('Invalid URL', 'INVALID_URL');
    }
    if (allowedHosts && !allowedHosts.has(parsed.hostname.toLowerCase())) {
      throw new ExtractionError('Invalid host', 'INVALID_HOST');
    }
    return parsed.toString();
  };

  const initialUrl = normalizeAndValidate(normalizedUrl);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let currentUrl = initialUrl;
      let redirects = 0;
      // In allowlist mode, block cross-host redirects by validating each hop before requesting.
      // In non-allowlist mode, preserve existing fetch behavior.
      while (true) {
        const response = await fetch(currentUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': userAgent,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            Connection: 'keep-alive',
            ...headers,
          },
          redirect: allowedHosts ? 'manual' : 'follow',
        });

        if (allowedHosts) {
          const finalHost = new URL(response.url).hostname.toLowerCase();
          if (!allowedHosts.has(finalHost)) {
            throw new ExtractionError('Invalid host', 'INVALID_HOST');
          }

          if (
            response.status >= 300 &&
            response.status < 400 &&
            response.headers.get('location')
          ) {
            if (redirects >= MAX_REDIRECTS) {
              throw new ExtractionError('Too many redirects', 'FETCH_FAILED');
            }
            const location = response.headers.get('location');
            if (!location) {
              throw new ExtractionError('Invalid redirect', 'FETCH_FAILED');
            }
            const nextUrl = normalizeAndValidate(
              new URL(location, currentUrl).toString()
            );
            currentUrl = nextUrl;
            redirects += 1;
            continue;
          }
        }

        clearTimeout(timeoutId);

        // Handle specific HTTP status codes
        if (response.status === 404) {
          throw new ExtractionError('Profile not found', 'NOT_FOUND', 404);
        }

        if (response.status === 429) {
          throw new ExtractionError(
            'Rate limited by platform',
            'RATE_LIMITED',
            429
          );
        }

        if (!response.ok) {
          throw new ExtractionError(
            `HTTP ${response.status}: ${response.statusText}`,
            'FETCH_FAILED',
            response.status
          );
        }

        const contentType = response.headers.get('content-type') ?? '';

        // Warn if response is not HTML (but don't fail - some platforms serve different content types)
        if (
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml')
        ) {
          logger.warn('Non-HTML content type received', {
            url: currentUrl,
            contentType,
          });
        }

        const html = await readResponseTextWithLimit(
          response,
          maxResponseBytes
        );

        if (!html || html.trim().length === 0) {
          throw new ExtractionError(
            'Empty response from server',
            'EMPTY_RESPONSE'
          );
        }

        // Basic HTML validation - should contain at least some HTML-like content
        if (!html.includes('<') && !html.includes('>')) {
          logger.warn('Response does not appear to be HTML', {
            url: currentUrl,
            contentLength: html.length,
          });
        }

        return {
          html,
          statusCode: response.status,
          finalUrl: response.url,
          contentType,
        };
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Don't retry on certain errors
      if (error instanceof ExtractionError) {
        if (['NOT_FOUND', 'RATE_LIMITED', 'INVALID_URL'].includes(error.code)) {
          throw error;
        }
      }

      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ExtractionError(
          `Request timed out after ${timeoutMs}ms`,
          'FETCH_TIMEOUT',
          undefined,
          error
        );
      } else {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Log retry attempt
      if (attempt < maxRetries) {
        logger.warn('Fetch attempt failed, retrying', {
          url: initialUrl,
          attempt: attempt + 1,
          maxRetries,
          error: lastError.message,
        });
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }

  // All retries exhausted
  throw lastError instanceof ExtractionError
    ? lastError
    : new ExtractionError(
        lastError?.message || 'Fetch failed after retries',
        'FETCH_FAILED',
        undefined,
        lastError
      );
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;

  if (typeof contentLength === 'number' && Number.isFinite(contentLength)) {
    if (contentLength > maxBytes) {
      throw new ExtractionError('Response too large', 'FETCH_FAILED');
    }
  }

  if (!response.body) {
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new ExtractionError('Response too large', 'FETCH_FAILED');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        throw new ExtractionError('Response too large', 'FETCH_FAILED');
      }
      out += decoder.decode(value, { stream: true });
    }
  }

  out += decoder.decode();
  return out;
}
