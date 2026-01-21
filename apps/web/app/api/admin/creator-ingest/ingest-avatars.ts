import { put as uploadBlob } from '@vercel/blob';
import { randomUUID } from 'crypto';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { maybeCopyIngestionAvatarFromLinks } from '@/lib/ingestion/magic-profile-avatar';
import { logger } from '@/lib/utils/logger';

function isSafeExternalHttpsUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost') return false;
    if (hostname.endsWith('.local')) return false;
    if (hostname.endsWith('.internal')) return false;

    // Block raw IP addresses (IPv4/IPv6) to reduce SSRF risk.
    // We intentionally do not DNS-resolve here.
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
    if (hostname.includes(':')) return false;

    return true;
  } catch {
    return false;
  }
}

export async function copyAvatarToBlob(
  sourceUrl: string,
  handle: string
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
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
    if (
      !contentType ||
      !SUPPORTED_IMAGE_MIME_TYPES.includes(
        contentType as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]
      )
    ) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > AVATAR_MAX_FILE_SIZE_BYTES) {
      throw new Error('Avatar exceeds max size');
    }
    const buffer = Buffer.from(arrayBuffer);

    if (
      !validateMagicBytes(
        buffer,
        contentType as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]
      )
    ) {
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

export type AvatarExtractionInput = {
  avatarUrl?: string | null;
  links: Array<{ url: string }>;
};

type AvatarDependencies = {
  copyAvatarToBlob?: typeof copyAvatarToBlob;
  copyAvatarFromLinks?: typeof maybeCopyIngestionAvatarFromLinks;
};

export async function handleAvatarFetching<T extends AvatarExtractionInput>(
  extraction: T,
  handle: string,
  dependencies: AvatarDependencies = {}
): Promise<{
  hostedAvatarUrl: string | null;
  extractionWithHostedAvatar: T & { avatarUrl: string | null };
}> {
  const externalAvatarUrl = extraction.avatarUrl?.trim() || null;
  const copyAvatarToBlobFn = dependencies.copyAvatarToBlob ?? copyAvatarToBlob;
  const copyAvatarFromLinksFn =
    dependencies.copyAvatarFromLinks ?? maybeCopyIngestionAvatarFromLinks;

  const hostedAvatarUrlFromProfile = externalAvatarUrl
    ? await copyAvatarToBlobFn(externalAvatarUrl, handle)
    : null;

  const hostedAvatarUrlFromLinks = hostedAvatarUrlFromProfile
    ? null
    : await copyAvatarFromLinksFn({
        handle,
        links: extraction.links
          .map(link => link.url)
          .filter((url): url is string => typeof url === 'string'),
      });

  const hostedAvatarUrl =
    hostedAvatarUrlFromProfile ?? hostedAvatarUrlFromLinks;

  const extractionWithHostedAvatar = {
    ...extraction,
    avatarUrl: hostedAvatarUrl ?? extraction.avatarUrl ?? null,
  };

  return {
    hostedAvatarUrl: hostedAvatarUrl ?? null,
    extractionWithHostedAvatar,
  };
}
