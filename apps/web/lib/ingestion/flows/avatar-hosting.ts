/**
 * Avatar Hosting Flow
 *
 * Handles copying external avatar images to Vercel Blob storage
 * with proper validation, optimization, and SSRF protection.
 *
 * Extracted to reduce cognitive complexity of the creator-ingest route.
 */

import { randomUUID } from 'node:crypto';
import { put as uploadBlob } from '@vercel/blob';
import { env } from '@/lib/env';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES_SET,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { maybeCopyIngestionAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import { logger } from '@/lib/utils/logger';

/**
 * Validate that a URL is safe for external fetching (SSRF protection).
 *
 * @param input - URL string to validate
 * @returns true if the URL is safe to fetch, false otherwise
 */
export function isSafeExternalHttpsUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost') return false;
    if (hostname.endsWith('.local')) return false;
    if (hostname.endsWith('.internal')) return false;

    // Block link-local / metadata ranges explicitly (defense-in-depth).
    // Note: this is ad-hoc; consider a dedicated SSRF filter library for comprehensive protection.
    if (hostname.includes('%')) return false; // Reject IPv6 zone identifiers (e.g. fe80::1%en0)
    if (/^\s*169\.254\.\d{1,3}\.\d{1,3}\s*$/.test(hostname)) return false;
    // Block full IPv6 link-local range fe80::/10 (fe80–febf), but only for IPv6 literals.
    if (hostname.includes(':') && /^fe[89ab]/i.test(hostname)) return false;

    // Block raw IP addresses (IPv4/IPv6) to reduce SSRF risk.
    // We intentionally do not DNS-resolve here.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    if (hostname.includes(':')) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Copy an external avatar image to Vercel Blob storage.
 *
 * Performs validation, optimization (resize to 512x512, convert to AVIF),
 * and uploads to blob storage.
 *
 * @param sourceUrl - External URL of the avatar image
 * @param handle - Creator handle (used in the blob path)
 * @returns Hosted blob URL, or null if copy failed
 */
export async function copyAvatarToBlob(
  sourceUrl: string,
  handle: string
): Promise<string | null> {
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    logger.warn('Skipping avatar copy: BLOB_READ_WRITE_TOKEN is not set');
    return null;
  }

  if (!isSafeExternalHttpsUrl(sourceUrl)) {
    logger.warn('Skipping avatar copy: unsafe avatar URL', {
      sourceUrl,
      handle,
    });
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(sourceUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0].toLowerCase() ?? '';
    if (!contentType || !SUPPORTED_IMAGE_MIME_TYPES_SET.has(contentType)) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    if (response.bodyUsed) {
      throw new Error('Response body has already been consumed');
    }

    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await response.arrayBuffer();
    } catch (error) {
      if (
        error instanceof TypeError &&
        error.message.includes('detached ArrayBuffer')
      ) {
        throw new Error('Response body was detached before reading');
      }
      throw error;
    }

    if (arrayBuffer.byteLength > AVATAR_MAX_FILE_SIZE_BYTES) {
      throw new Error('Avatar exceeds max size');
    }
    const buffer = Buffer.from(arrayBuffer);

    if (!validateMagicBytes(buffer, contentType as SupportedImageMimeType)) {
      throw new Error('Magic bytes validation failed');
    }

    const sharp = (await import('sharp')).default;
    const baseImage = sharp(buffer, { failOnError: false })
      .rotate()
      .withMetadata({ orientation: undefined });

    const optimized = await baseImage
      .resize({
        width: 512,
        height: 512,
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true,
      })
      .toColourspace('srgb')
      .avif({ quality: 65, effort: 4 })
      .toBuffer();

    const path = `avatars/ingestion/${handle}/${buildSeoFilename({
      originalFilename: 'avatar',
      photoId: randomUUID(),
    })}.avif`;

    const blob = await uploadBlob(path, optimized, {
      access: 'public',
      token,
      contentType: 'image/avif',
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      addRandomSuffix: false,
    });

    if (!blob?.url) {
      throw new Error('Blob upload returned no URL');
    }

    return blob.url;
  } catch (error) {
    logger.warn('Failed to copy avatar to blob', {
      sourceUrl,
      handle,
      error,
    });
    return null;
  }
}

/**
 * Resolve the best hosted avatar URL from extraction data.
 *
 * Tries the profile's avatar URL first, then falls back to extracting
 * an avatar from the discovered links.
 *
 * @param handle - Creator handle
 * @param extraction - Extracted profile data with potential avatar URL and links
 * @returns Hosted avatar URL, or null if no avatar could be obtained
 */
export async function resolveHostedAvatarUrl(
  handle: string,
  extraction: { avatarUrl?: string | null; links: Array<{ url?: string }> }
): Promise<string | null> {
  const externalAvatarUrl = extraction.avatarUrl?.trim() || null;

  const hostedAvatarUrlFromProfile = externalAvatarUrl
    ? await copyAvatarToBlob(externalAvatarUrl, handle)
    : null;

  const hostedAvatarUrlFromLinks = hostedAvatarUrlFromProfile
    ? null
    : await maybeCopyIngestionAvatarFromLinks({
        handle,
        links: extraction.links
          .map(link => link.url)
          .filter((url): url is string => typeof url === 'string'),
      });

  return hostedAvatarUrlFromProfile ?? hostedAvatarUrlFromLinks;
}
