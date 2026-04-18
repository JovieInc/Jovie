import 'server-only';

import { list, put } from '@vercel/blob';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import type { AlbumArtCandidate, AlbumArtManifest } from './types';

function fallbackBlobUrl(path: string): string {
  return `https://blob.vercel-storage.com/${path}`;
}

function sanitizeManifestForUpload(
  manifest: AlbumArtManifest
): AlbumArtManifest {
  return {
    ...manifest,
    prompt: null,
    candidates: manifest.candidates.map(candidate => ({
      ...candidate,
      prompt: null,
    })),
  };
}

async function uploadPublicBuffer(params: {
  readonly path: string;
  readonly buffer: Buffer;
  readonly contentType: string;
}): Promise<string> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    if (env.NODE_ENV === 'production') {
      throw new TypeError('Blob storage not configured');
    }
    logger.warn('[album-art] Blob token missing; returning development URL', {
      path: params.path,
    });
    return fallbackBlobUrl(params.path);
  }

  const blob = await put(params.path, params.buffer, {
    access: 'public',
    token: env.BLOB_READ_WRITE_TOKEN,
    contentType: params.contentType,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
    addRandomSuffix: false,
  });

  if (!blob.url?.startsWith('https://')) {
    throw new TypeError('Invalid blob URL returned from storage');
  }

  return blob.url;
}

export async function uploadAlbumArtCandidate(params: {
  readonly profileId: string;
  readonly generationId: string;
  readonly candidateId: string;
  readonly fullRes: Buffer;
  readonly preview: Buffer;
}): Promise<{ readonly fullResUrl: string; readonly previewUrl: string }> {
  const basePath = `artwork/generated/${params.profileId}/${params.generationId}/${params.candidateId}`;
  const [fullResUrl, previewUrl] = await Promise.all([
    uploadPublicBuffer({
      path: `${basePath}.jpg`,
      buffer: params.fullRes,
      contentType: 'image/jpeg',
    }),
    uploadPublicBuffer({
      path: `${basePath}-preview.jpg`,
      buffer: params.preview,
      contentType: 'image/jpeg',
    }),
  ]);

  return { fullResUrl, previewUrl };
}

export async function uploadAlbumArtManifest(
  manifest: AlbumArtManifest
): Promise<string> {
  const path = `artwork/generated/${manifest.profileId}/${manifest.generationId}/manifest.json`;
  return uploadPublicBuffer({
    path,
    buffer: Buffer.from(
      JSON.stringify(sanitizeManifestForUpload(manifest)),
      'utf8'
    ),
    contentType: 'application/json',
  });
}

export async function fetchAlbumArtManifest(params: {
  readonly profileId: string;
  readonly generationId: string;
}): Promise<AlbumArtManifest> {
  const pathname = `artwork/generated/${params.profileId}/${params.generationId}/manifest.json`;
  const url = env.BLOB_READ_WRITE_TOKEN
    ? ((
        await list({
          prefix: pathname,
          token: env.BLOB_READ_WRITE_TOKEN,
          limit: 1,
        })
      ).blobs[0]?.url ?? fallbackBlobUrl(pathname))
    : fallbackBlobUrl(pathname);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Generated artwork manifest not found');
  }
  return (await response.json()) as AlbumArtManifest;
}

export function findManifestCandidate(
  manifest: AlbumArtManifest,
  candidateId: string
): AlbumArtCandidate {
  const candidate = manifest.candidates.find(item => item.id === candidateId);
  if (!candidate) {
    throw new Error('Generated artwork candidate not found');
  }
  return candidate;
}

export async function fetchCandidateBuffer(
  candidate: AlbumArtCandidate
): Promise<Buffer> {
  const response = await fetch(candidate.fullResUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Generated artwork image not found');
  }
  return Buffer.from(await response.arrayBuffer());
}
