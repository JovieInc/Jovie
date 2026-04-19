import 'server-only';

import { randomUUID } from 'node:crypto';
import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { processArtworkBufferToSizes } from '@/app/api/images/artwork/upload/process';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { generateUniqueSlug } from '@/lib/discography/slug';
import { env } from '@/lib/env-server';
import {
  fetchAlbumArtManifest,
  fetchCandidateBuffer,
  findManifestCandidate,
} from './storage';

function buildOriginalArtworkFields(
  existingMetadata: Record<string, unknown>,
  currentArtworkUrl: string | null
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (!existingMetadata.originalArtworkUrl && currentArtworkUrl) {
    fields.originalArtworkUrl = currentArtworkUrl;
    if (existingMetadata.artworkSizes) {
      fields.originalArtworkSizes = existingMetadata.artworkSizes;
    }
  }
  return fields;
}

async function getOwnedProfile(params: {
  readonly profileId: string;
  readonly clerkUserId: string;
}) {
  const [profile] = await db
    .select({
      id: creatorProfiles.id,
      userId: creatorProfiles.userId,
      clerkId: users.clerkId,
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .where(eq(creatorProfiles.id, params.profileId))
    .limit(1);

  if (profile?.clerkId !== params.clerkUserId) {
    throw new Error('Profile not found');
  }

  return profile;
}

async function uploadProcessedReleaseArtwork(params: {
  readonly releaseId: string;
  readonly buffer: Buffer;
}): Promise<Record<string, string>> {
  const processed = await processArtworkBufferToSizes(params.buffer);
  const { getVercelBlobUploader, AVIF_MIME_TYPE, withTimeout } = await import(
    '@/app/api/images/upload/lib'
  );
  const put = await getVercelBlobUploader();
  const token = env.BLOB_READ_WRITE_TOKEN;
  const sizes: Record<string, string> = {};

  for (const [sizeKey, buffer] of Object.entries(processed)) {
    const blobPath = `artwork/releases/${params.releaseId}/${sizeKey}.avif`;
    if (!put || !token) {
      if (env.NODE_ENV === 'production') {
        throw new TypeError('Blob storage not configured');
      }
      sizes[sizeKey] = `https://blob.vercel-storage.com/${blobPath}`;
      continue;
    }

    const blob = await withTimeout(
      put(blobPath, buffer, {
        access: 'public',
        token,
        contentType: AVIF_MIME_TYPE,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
        addRandomSuffix: false,
      }),
      30_000,
      `Generated artwork upload (${sizeKey})`
    );
    if (!blob.url?.startsWith('https://')) {
      throw new TypeError('Invalid blob URL returned from storage');
    }
    sizes[sizeKey] = blob.url;
  }

  return sizes;
}

async function deleteProcessedReleaseArtwork(
  sizes: Record<string, string>
): Promise<void> {
  const urls = Object.values(sizes).filter(Boolean);
  if (urls.length === 0) return;
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  await del(urls, { token });
}

async function prepareGeneratedArtwork(params: {
  readonly profileId: string;
  readonly generationId: string;
  readonly candidateId: string;
  readonly releaseId: string;
}) {
  const manifest = await fetchAlbumArtManifest({
    profileId: params.profileId,
    generationId: params.generationId,
  });
  if (manifest.profileId !== params.profileId) {
    throw new Error('Generated artwork not found');
  }

  const candidate = findManifestCandidate(manifest, params.candidateId);
  const candidateBuffer = await fetchCandidateBuffer(candidate);
  const sizes = await uploadProcessedReleaseArtwork({
    releaseId: params.releaseId,
    buffer: candidateBuffer,
  });
  const artworkUrl = sizes['1000'] ?? sizes.original;
  if (!artworkUrl) {
    throw new Error('Generated artwork produced no usable sizes');
  }

  return { candidate, artworkUrl, sizes };
}

function buildGeneratedArtworkMetadata(params: {
  readonly candidate: Awaited<
    ReturnType<typeof prepareGeneratedArtwork>
  >['candidate'];
  readonly generationId: string;
}) {
  return {
    provider: 'xai' as const,
    model: params.candidate.model,
    styleId: params.candidate.styleId,
    generationId: params.generationId,
    candidateId: params.candidate.id,
    prompt: params.candidate.prompt,
    appliedAt: new Date().toISOString(),
  };
}

export async function applyGeneratedAlbumArt(params: {
  readonly clerkUserId: string;
  readonly profileId: string;
  readonly releaseId: string;
  readonly generationId: string;
  readonly candidateId: string;
}): Promise<{
  readonly releaseId: string;
  readonly artworkUrl: string;
  readonly sizes: Record<string, string>;
}> {
  const profile = await getOwnedProfile({
    profileId: params.profileId,
    clerkUserId: params.clerkUserId,
  });
  const [release] = await db
    .select({
      id: discogReleases.id,
      creatorProfileId: discogReleases.creatorProfileId,
      artworkUrl: discogReleases.artworkUrl,
      metadata: discogReleases.metadata,
    })
    .from(discogReleases)
    .where(eq(discogReleases.id, params.releaseId))
    .limit(1);

  if (!release || release.creatorProfileId !== profile.id) {
    throw new Error('Release not found');
  }

  const prepared = await prepareGeneratedArtwork({
    profileId: params.profileId,
    generationId: params.generationId,
    releaseId: params.releaseId,
    candidateId: params.candidateId,
  });

  const existingMetadata = (release.metadata ?? {}) as Record<string, unknown>;
  await db
    .update(discogReleases)
    .set({
      artworkUrl: prepared.artworkUrl,
      metadata: {
        ...existingMetadata,
        ...buildOriginalArtworkFields(existingMetadata, release.artworkUrl),
        artworkSizes: prepared.sizes,
        generatedArtwork: buildGeneratedArtworkMetadata({
          candidate: prepared.candidate,
          generationId: params.generationId,
        }),
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, params.releaseId));

  revalidateTag(`releases:${params.clerkUserId}:${profile.id}`, 'max');
  revalidateTag(createSmartLinkContentTag(profile.id), 'max');

  return {
    releaseId: params.releaseId,
    artworkUrl: prepared.artworkUrl,
    sizes: prepared.sizes,
  };
}

export async function createReleaseAndApplyGeneratedAlbumArt(params: {
  readonly clerkUserId: string;
  readonly profileId: string;
  readonly title: string;
  readonly releaseType:
    | 'single'
    | 'ep'
    | 'album'
    | 'compilation'
    | 'live'
    | 'mixtape'
    | 'other';
  readonly releaseDate?: string;
  readonly generationId: string;
  readonly candidateId: string;
}) {
  const profile = await getOwnedProfile({
    profileId: params.profileId,
    clerkUserId: params.clerkUserId,
  });
  const parsedDate = params.releaseDate ? new Date(params.releaseDate) : null;
  const slug = await generateUniqueSlug(
    params.profileId,
    params.title,
    'release'
  );
  const releaseId = randomUUID();
  const prepared = await prepareGeneratedArtwork({
    profileId: params.profileId,
    generationId: params.generationId,
    releaseId,
    candidateId: params.candidateId,
  });
  const now = new Date();
  let release;
  try {
    [release] = await db
      .insert(discogReleases)
      .values({
        id: releaseId,
        creatorProfileId: params.profileId,
        title: params.title,
        slug,
        releaseType: params.releaseType,
        releaseDate:
          parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
        artworkUrl: prepared.artworkUrl,
        sourceType: 'manual',
        metadata: {
          artworkSizes: prepared.sizes,
          generatedArtwork: buildGeneratedArtworkMetadata({
            candidate: prepared.candidate,
            generationId: params.generationId,
          }),
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  } catch (error) {
    await deleteProcessedReleaseArtwork(prepared.sizes).catch(() => undefined);
    throw error;
  }

  revalidateTag(`releases:${params.clerkUserId}:${profile.id}`, 'max');
  revalidateTag(createSmartLinkContentTag(profile.id), 'max');

  return {
    releaseId: release.id,
    title: release.title,
    slug: release.slug,
    artworkUrl: prepared.artworkUrl,
    sizes: prepared.sizes,
  };
}
