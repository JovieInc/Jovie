/**
 * HTTP Client
 *
 * Safe HTTP client utilities for downloading avatar images.
 */

import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  SUPPORTED_IMAGE_MIME_TYPES_SET,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { DOWNLOAD_TIMEOUT_MS, MAX_REDIRECTS } from './constants';
import { isPrivateHostname } from './network-safety';
import type { DownloadedImage } from './types';

/**
 * Sanitize and validate an HTTPS URL.
 */
export function sanitizeHttpsUrl(
  candidate: string | null | undefined
): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    );
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Derive a filename from a URL.
 */
export function deriveFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).slice(-1)[0];
    if (last && last.length <= 128) return last;
    return 'remote-avatar';
  } catch {
    return 'remote-avatar';
  }
}

/**
 * Validate content-length header against max bytes limit.
 * Throws if content-length exceeds the limit.
 */
function validateContentLength(response: Response, maxBytes: number): void {
  const contentLengthHeader = response.headers.get('content-length');
  if (!contentLengthHeader) return;
  const contentLength = Number(contentLengthHeader);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new TypeError('Response too large');
  }
}

/**
 * Read response body without streaming (fallback when body is null).
 */
async function readResponseArrayBuffer(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  if (response.bodyUsed) {
    throw new TypeError('Response body has already been consumed');
  }
  try {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new TypeError('Response too large');
    }
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message.includes('detached ArrayBuffer')
    ) {
      throw new TypeError('Response body was detached before reading');
    }
    throw error;
  }
}

/**
 * Read response body with size limit.
 */
export async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  validateContentLength(response, maxBytes);

  if (!response.body) {
    return readResponseArrayBuffer(response, maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        throw new TypeError('Response too large');
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

/**
 * Fetch with manual redirect handling for SSRF protection.
 */
export async function fetchWithRedirects(
  initialUrl: string,
  options: { timeoutMs: number; maxBytes: number }
): Promise<{ response: Response; finalUrl: string }> {
  let current = initialUrl;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          Accept: 'image/*,*/*;q=0.8',
          'User-Agent': 'jovie-link-ingestion/1.0 (+https://meetjovie.com)',
        },
      });

      const location = res.headers.get('location');
      const isRedirect = res.status >= 300 && res.status < 400 && location;
      if (isRedirect) {
        const next = new URL(location, current).toString();
        const parsed = new URL(next);
        if (parsed.protocol !== 'https:') {
          throw new TypeError('Invalid redirect protocol');
        }
        if (await isPrivateHostname(parsed.hostname)) {
          throw new TypeError('Invalid redirect host');
        }
        current = parsed.toString();
        continue;
      }

      return { response: res, finalUrl: current };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new TypeError('Too many redirects');
}

/**
 * Download an image with validation.
 */
export async function downloadImage(
  imageUrl: string
): Promise<DownloadedImage> {
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== 'https:') {
    throw new TypeError('Invalid image URL');
  }
  if (await isPrivateHostname(parsed.hostname)) {
    throw new TypeError('Invalid image host');
  }

  const { response, finalUrl } = await fetchWithRedirects(imageUrl, {
    timeoutMs: DOWNLOAD_TIMEOUT_MS,
    maxBytes: AVATAR_MAX_FILE_SIZE_BYTES,
  });

  if (!response.ok) {
    throw new Error(`Image download failed: ${response.status}`);
  }

  const contentTypeHeader = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();

  if (!contentTypeHeader) {
    throw new TypeError('Unsupported image content type');
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES_SET.has(contentTypeHeader)) {
    throw new TypeError('Unsupported image content type');
  }

  const contentType = contentTypeHeader as SupportedImageMimeType;

  const buffer = await readResponseBytesWithLimit(
    response,
    AVATAR_MAX_FILE_SIZE_BYTES
  );
  if (!validateMagicBytes(buffer, contentType)) {
    throw new TypeError('Invalid image bytes');
  }

  return {
    buffer,
    contentType,
    filename: deriveFilenameFromUrl(finalUrl),
  };
}
