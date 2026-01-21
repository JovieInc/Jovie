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
 * Validates and normalizes a URL, ensuring it uses HTTPS and is in the allowlist.
 */
function normalizeAndValidateUrl(
  candidateUrl: string,
  allowedHosts?: Set<string>
): string {
  const parsed = new URL(candidateUrl);
  if (parsed.protocol !== 'https:') {
    throw new ExtractionError('Invalid URL', 'INVALID_URL');
  }
  if (allowedHosts && !allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new ExtractionError('Invalid host', 'INVALID_HOST');
  }
  return parsed.toString();
}

/**
 * Validates HTTP response status and throws appropriate errors.
 */
function validateResponseStatus(response: Response): void {
  if (response.status === 404) {
    throw new ExtractionError('Profile not found', 'NOT_FOUND', 404);
  }
  if (response.status === 429) {
    throw new ExtractionError('Rate limited by platform', 'RATE_LIMITED', 429);
  }
  if (!response.ok) {
    throw new ExtractionError(
      `HTTP ${response.status}: ${response.statusText}`,
      'FETCH_FAILED',
      response.status
    );
  }
}

/**
 * Validates HTML content and returns the final result.
 */
function validateAndBuildResult(
  html: string,
  response: Response,
  finalUrl: string
): FetchResult {
  if (!html || html.trim().length === 0) {
    throw new ExtractionError('Empty response from server', 'EMPTY_RESPONSE');
  }

  const contentType = response.headers.get('content-type') ?? '';

  // Warn if response is not HTML (but don't fail)
  if (
    !contentType.includes('text/html') &&
    !contentType.includes('application/xhtml')
  ) {
    logger.warn('Non-HTML content type received', {
      url: finalUrl,
      contentType,
    });
  }

  // Basic HTML validation
  if (!html.includes('<') && !html.includes('>')) {
    logger.warn('Response does not appear to be HTML', {
      url: finalUrl,
      contentLength: html.length,
    });
  }

  return {
    html,
    statusCode: response.status,
    finalUrl,
    contentType,
  };
}

/**
 * Handles manual redirect following with host validation.
 */
async function handleRedirect(
  response: Response,
  currentUrl: string,
  redirects: number,
  allowedHosts: Set<string>
): Promise<string | null> {
  const finalHost = new URL(response.url).hostname.toLowerCase();
  if (!allowedHosts.has(finalHost)) {
    throw new ExtractionError('Invalid host', 'INVALID_HOST');
  }

  const isRedirect =
    response.status >= 300 &&
    response.status < 400 &&
    response.headers.get('location');

  if (!isRedirect) {
    return null;
  }

  if (redirects >= MAX_REDIRECTS) {
    throw new ExtractionError('Too many redirects', 'FETCH_FAILED');
  }

  const location = response.headers.get('location');
  if (!location) {
    throw new ExtractionError('Invalid redirect', 'FETCH_FAILED');
  }

  return normalizeAndValidateUrl(
    new URL(location, currentUrl).toString(),
    allowedHosts
  );
}

/**
 * Fetches a URL with redirect handling.
 */
async function fetchWithRedirects(
  initialUrl: string,
  controller: AbortController,
  options: {
    userAgent: string;
    headers: Record<string, string>;
    allowedHosts?: Set<string>;
    maxResponseBytes: number;
  }
): Promise<FetchResult> {
  let currentUrl = initialUrl;
  let redirects = 0;

  while (true) {
    const response = await fetch(currentUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': options.userAgent,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        Connection: 'keep-alive',
        ...options.headers,
      },
      redirect: options.allowedHosts ? 'manual' : 'follow',
    });

    if (options.allowedHosts) {
      const nextUrl = await handleRedirect(
        response,
        currentUrl,
        redirects,
        options.allowedHosts
      );
      if (nextUrl) {
        currentUrl = nextUrl;
        redirects += 1;
        continue;
      }
    }

    validateResponseStatus(response);
    const html = await readResponseTextWithLimit(
      response,
      options.maxResponseBytes
    );
    return validateAndBuildResult(html, response, currentUrl);
  }
}

/**
 * Determines if an error should be retried.
 */
function shouldRetryError(error: unknown): boolean {
  if (error instanceof ExtractionError) {
    return ![
      'NOT_FOUND',
      'RATE_LIMITED',
      'INVALID_URL',
      'INVALID_HOST',
    ].includes(error.code);
  }
  return true;
}

/**
 * Converts an error to an ExtractionError with proper context.
 */
function normalizeError(
  error: unknown,
  timeoutMs: number
): ExtractionError | Error {
  if (error instanceof Error && error.name === 'AbortError') {
    return new ExtractionError(
      `Request timed out after ${timeoutMs}ms`,
      'FETCH_TIMEOUT',
      undefined,
      error
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

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
  const initialUrl = normalizeAndValidateUrl(normalizedUrl, allowedHosts);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await fetchWithRedirects(initialUrl, controller, {
        userAgent,
        headers,
        allowedHosts,
        maxResponseBytes,
      });
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      if (!shouldRetryError(error)) {
        throw error;
      }

      lastError = normalizeError(error, timeoutMs);

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

  throw lastError instanceof ExtractionError
    ? lastError
    : new ExtractionError(
        lastError?.message || 'Fetch failed after retries',
        'FETCH_FAILED',
        undefined,
        lastError
      );
}

function validateContentLength(
  contentLengthHeader: string | null,
  maxBytes: number
): void {
  if (!contentLengthHeader) return;
  const contentLength = Number(contentLengthHeader);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ExtractionError('Response too large', 'FETCH_FAILED');
  }
}

function throwIfTooLarge(size: number, maxBytes: number): void {
  if (size > maxBytes) {
    throw new ExtractionError('Response too large', 'FETCH_FAILED');
  }
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  validateContentLength(response.headers.get('content-length'), maxBytes);

  if (!response.body) {
    const text = await response.text();
    throwIfTooLarge(text.length, maxBytes);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    throwIfTooLarge(received, maxBytes);
    out += decoder.decode(value, { stream: true });
  }

  out += decoder.decode();
  return out;
}
