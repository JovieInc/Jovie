import 'server-only';

import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import type { OutputInfo } from 'sharp';
import type { DbType } from '@/lib/db';
import { creatorProfiles, profilePhotos } from '@/lib/db/schema';
import {
  AVATAR_MAX_FILE_SIZE_BYTES,
  buildSeoFilename,
  SUPPORTED_IMAGE_MIME_TYPES,
  type SupportedImageMimeType,
} from '@/lib/images/config';
import { validateMagicBytes } from '@/lib/images/validate-magic-bytes';
import { logger } from '@/lib/utils/logger';
import { normalizeUrl } from '@/lib/utils/platform-detection';
import { normalizeString } from '@/lib/utils/string-utils';
import { extractMetaContent, fetchDocument } from './strategies/base';
import {
  extractBeacons,
  fetchBeaconsDocument,
  validateBeaconsUrl,
} from './strategies/beacons';
import {
  extractLaylo,
  extractLayloHandle,
  fetchLayloProfile,
} from './strategies/laylo';
import {
  extractLinktree,
  fetchLinktreeDocument,
  validateLinktreeUrl,
} from './strategies/linktree';
import {
  extractYouTube,
  fetchYouTubeAboutDocument,
  validateYouTubeChannelUrl,
} from './strategies/youtube';

type SharpModule = typeof import('sharp');
type SharpConstructor = SharpModule extends { default: infer D }
  ? D
  : SharpModule;

type AvatarCandidate = {
  avatarUrl: string;
  sourcePlatform: string;
};

type DownloadedImage = {
  buffer: Buffer;
  contentType: SupportedImageMimeType;
  filename: string;
};

type OptimizedAvatar = {
  data: Buffer;
  info: OutputInfo;
  width: number | null;
  height: number | null;
};

const AVIF_MIME_TYPE = 'image/avif';
const PROCESSING_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

function sanitizeHttpsUrl(candidate: string | null | undefined): string | null {
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

export async function maybeCopyIngestionAvatarFromLinks(params: {
  handle: string;
  links: string[];
}): Promise<string | null> {
  const { handle, links } = params;
  const safeHandle = normalizeString(handle);
  if (!safeHandle) return null;
  if (links.length === 0) return null;

  for (const linkUrl of links) {
    try {
      const candidate = await extractAvatarCandidateFromLinkUrl(linkUrl);
      if (!candidate) continue;

      const downloaded = await downloadImage(candidate.avatarUrl);
      const optimized = await withTimeout(
        optimizeToAvatarAvif(downloaded.buffer),
        PROCESSING_TIMEOUT_MS
      );

      const seoFileName = buildSeoFilename({
        originalFilename: downloaded.filename,
        photoId: randomUUID(),
        userLabel: safeHandle,
      });

      const blobPath = `avatars/ingestion/${safeHandle}/${seoFileName}.avif`;
      const blobUrl = await withTimeout(
        uploadBufferToBlob({
          path: blobPath,
          buffer: optimized.data,
          contentType: AVIF_MIME_TYPE,
        }),
        PROCESSING_TIMEOUT_MS
      );

      return blobUrl;
    } catch {
      continue;
    }
  }

  return null;
}

function deriveFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split('/').filter(Boolean).slice(-1)[0];
    if (last && last.length <= 128) return last;
    return 'remote-avatar';
  } catch {
    return 'remote-avatar';
  }
}

function isPrivateIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (!version) return false;

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
}

async function isPrivateHostname(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;

  if (isPrivateIpAddress(lower)) return true;

  try {
    const results = await lookup(lower, { all: true });
    return results.some(result => isPrivateIpAddress(result.address));
  } catch {
    return true;
  }
}

async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number
): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : null;
  if (typeof contentLength === 'number' && Number.isFinite(contentLength)) {
    if (contentLength > maxBytes) {
      throw new Error('Response too large');
    }
  }

  if (!response.body) {
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error('Response too large');
    }
    return Buffer.from(arrayBuffer);
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
        throw new Error('Response too large');
      }
      chunks.push(value);
    }
  }

  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

async function fetchWithRedirects(
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
        const next = new URL(location!, current).toString();
        const parsed = new URL(next);
        if (parsed.protocol !== 'https:') {
          throw new Error('Invalid redirect protocol');
        }
        if (await isPrivateHostname(parsed.hostname)) {
          throw new Error('Invalid redirect host');
        }
        current = parsed.toString();
        continue;
      }

      return { response: res, finalUrl: current };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error('Too many redirects');
}

async function downloadImage(imageUrl: string): Promise<DownloadedImage> {
  const parsed = new URL(imageUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid image URL');
  }
  if (await isPrivateHostname(parsed.hostname)) {
    throw new Error('Invalid image host');
  }

  const { response, finalUrl } = await fetchWithRedirects(imageUrl, {
    timeoutMs: 12_000,
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
    throw new Error('Unsupported image content type');
  }

  if (
    !SUPPORTED_IMAGE_MIME_TYPES.includes(
      contentTypeHeader as SupportedImageMimeType
    )
  ) {
    throw new Error('Unsupported image content type');
  }

  const contentType = contentTypeHeader as SupportedImageMimeType;

  const buffer = await readResponseBytesWithLimit(
    response,
    AVATAR_MAX_FILE_SIZE_BYTES
  );
  if (!validateMagicBytes(buffer, contentType)) {
    throw new Error('Invalid image bytes');
  }

  return {
    buffer,
    contentType,
    filename: deriveFilenameFromUrl(finalUrl),
  };
}

async function getSharp(): Promise<SharpConstructor> {
  const sharpModule = (await import('sharp')) as unknown as SharpModule;
  const factory = (sharpModule as SharpModule & { default?: unknown }).default;
  if (factory) {
    return factory as SharpConstructor;
  }
  return sharpModule as unknown as SharpConstructor;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function optimizeToAvatarAvif(
  inputBuffer: Buffer
): Promise<OptimizedAvatar> {
  const sharp = await getSharp();
  const baseImage = sharp(inputBuffer, { failOnError: false })
    .rotate()
    .withMetadata({ orientation: undefined });

  const metadata = await baseImage.metadata();

  const avatar = await baseImage
    .clone()
    .resize({
      width: 512,
      height: 512,
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .avif({ quality: 65, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    data: avatar.data,
    info: avatar.info,
    width: avatar.info.width ?? metadata.width ?? null,
    height: avatar.info.height ?? metadata.height ?? null,
  };
}

async function uploadBufferToBlob(params: {
  path: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Blob storage not configured');
    }
    return `https://blob.vercel-storage.com/${params.path}`;
  }

  const blob = await put(params.path, params.buffer, {
    access: 'public',
    token,
    contentType: params.contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    addRandomSuffix: false,
  });

  return blob.url;
}

async function extractAvatarCandidateFromLinkUrl(
  url: string
): Promise<AvatarCandidate | null> {
  const normalized = normalizeUrl(url);

  const linktree = validateLinktreeUrl(normalized);
  if (linktree) {
    const html = await fetchLinktreeDocument(linktree);
    const extracted = extractLinktree(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'linktree' } : null;
  }

  const beacons = validateBeaconsUrl(normalized);
  if (beacons) {
    const html = await fetchBeaconsDocument(beacons);
    const extracted = extractBeacons(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'beacons' } : null;
  }

  const layloHandle = extractLayloHandle(normalized);
  if (layloHandle) {
    const { profile, user } = await fetchLayloProfile(layloHandle);
    const extracted = extractLaylo(profile, user);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'laylo' } : null;
  }

  const youtube = validateYouTubeChannelUrl(normalized);
  if (youtube) {
    const html = await fetchYouTubeAboutDocument(youtube);
    const extracted = extractYouTube(html);
    const avatarUrl = sanitizeHttpsUrl(extracted.avatarUrl);
    return avatarUrl ? { avatarUrl, sourcePlatform: 'youtube' } : null;
  }

  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase();
  const variant = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const { html } = await fetchDocument(normalized, {
    timeoutMs: 8000,
    maxRetries: 1,
    allowedHosts: new Set([host, variant]),
  });

  const ogImage = sanitizeHttpsUrl(extractMetaContent(html, 'og:image'));
  if (ogImage) {
    return { avatarUrl: ogImage, sourcePlatform: 'web' };
  }

  const twitterImage = sanitizeHttpsUrl(
    extractMetaContent(html, 'twitter:image')
  );
  if (twitterImage) {
    return { avatarUrl: twitterImage, sourcePlatform: 'web' };
  }

  return null;
}

export async function maybeSetProfileAvatarFromLinks(params: {
  db: DbType;
  clerkUserId: string;
  profileId: string;
  userId: string | null;
  currentAvatarUrl: string | null;
  avatarLockedByUser: boolean | null;
  links: string[];
  sourceType?: 'manual' | 'admin' | 'ingested';
  ingestionOwnerUserId?: string | null;
  confidence?: string;
}): Promise<string | null> {
  const {
    db,
    clerkUserId,
    profileId,
    userId,
    currentAvatarUrl,
    avatarLockedByUser,
    links,
    sourceType = 'manual',
    ingestionOwnerUserId = null,
    confidence = '0.80',
  } = params;

  if (!userId) return null;
  if (avatarLockedByUser) return null;
  if (currentAvatarUrl) return null;

  for (const linkUrl of links) {
    try {
      const candidate = await extractAvatarCandidateFromLinkUrl(linkUrl);
      if (!candidate) continue;

      const downloaded = await downloadImage(candidate.avatarUrl);

      const [photoRecord] = await db
        .insert(profilePhotos)
        .values({
          userId,
          creatorProfileId: profileId,
          ingestionOwnerUserId,
          status: 'processing',
          sourcePlatform: candidate.sourcePlatform,
          sourceType,
          confidence,
          lockedByUser: false,
          originalFilename: downloaded.filename,
          mimeType: downloaded.contentType,
          fileSize: downloaded.buffer.length,
        })
        .returning({ id: profilePhotos.id });

      if (!photoRecord?.id) continue;

      const optimized = await withTimeout(
        optimizeToAvatarAvif(downloaded.buffer),
        PROCESSING_TIMEOUT_MS
      );

      const seoFileName = buildSeoFilename({
        originalFilename: downloaded.filename,
        photoId: photoRecord.id,
      });
      const blobPath = `avatars/users/${clerkUserId}/${seoFileName}.avif`;

      const blobUrl = await withTimeout(
        uploadBufferToBlob({
          path: blobPath,
          buffer: optimized.data,
          contentType: AVIF_MIME_TYPE,
        }),
        PROCESSING_TIMEOUT_MS
      );

      await db
        .update(profilePhotos)
        .set({
          blobUrl,
          smallUrl: blobUrl,
          mediumUrl: blobUrl,
          largeUrl: blobUrl,
          status: 'ready',
          mimeType: AVIF_MIME_TYPE,
          fileSize: optimized.info.size ?? optimized.data.length,
          width: optimized.width,
          height: optimized.height,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(profilePhotos.id, photoRecord.id));

      await db
        .update(creatorProfiles)
        .set({ avatarUrl: blobUrl, updatedAt: new Date() })
        .where(eq(creatorProfiles.id, profileId));

      return blobUrl;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Copy an external avatar URL directly to Jovie's blob storage.
 *
 * This is useful during ingestion when we already have an extracted avatar URL
 * and want to re-host it on Jovie's storage instead of storing the external URL.
 *
 * @param params.externalUrl - The external HTTPS URL to copy
 * @param params.handle - The profile handle (used for storage path)
 * @param params.sourcePlatform - The source platform for logging/tracking
 * @returns The Jovie blob URL or null if copying failed
 */
export async function copyExternalAvatarToStorage(params: {
  externalUrl: string;
  handle: string;
  sourcePlatform?: string;
}): Promise<string | null> {
  const { externalUrl, handle, sourcePlatform = 'ingestion' } = params;

  const sanitized = sanitizeHttpsUrl(externalUrl);
  if (!sanitized) return null;

  const safeHandle = normalizeString(handle);
  if (!safeHandle) return null;

  try {
    const downloaded = await downloadImage(sanitized);

    const optimized = await withTimeout(
      optimizeToAvatarAvif(downloaded.buffer),
      PROCESSING_TIMEOUT_MS
    );

    const seoFileName = buildSeoFilename({
      originalFilename: downloaded.filename,
      photoId: randomUUID(),
      userLabel: safeHandle,
    });

    const blobPath = `avatars/ingestion/${safeHandle}/${seoFileName}.avif`;

    const blobUrl = await withTimeout(
      uploadBufferToBlob({
        path: blobPath,
        buffer: optimized.data,
        contentType: AVIF_MIME_TYPE,
      }),
      PROCESSING_TIMEOUT_MS
    );

    return blobUrl;
  } catch (error) {
    // Log but don't throw - avatar copying is best-effort
    logger.warn('copyExternalAvatarToStorage failed', {
      sourcePlatform,
      error,
    });
    return null;
  }
}
