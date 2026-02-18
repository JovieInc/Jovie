'use server';

import { eq } from 'drizzle-orm';
import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
} from 'next/cache';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { discogReleases } from '@/lib/db/schema/content';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { getReleaseById } from '@/lib/discography/queries';
import { requireProfile } from './releases-shared';

/**
 * Upload release artwork via the artwork upload API.
 * Returns the new artwork URL after processing and storage.
 */
export async function uploadReleaseArtwork(
  releaseId: string,
  file: File
): Promise<{ artworkUrl: string; sizes: Record<string, string> }> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user
  const release = await getReleaseById(releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  // Build FormData and call the artwork upload API
  const formData = new FormData();
  formData.append('file', file);

  const { publicEnv } = await import('@/lib/env-public');
  const baseUrl = publicEnv.NEXT_PUBLIC_APP_URL;
  const response = await fetch(
    `${baseUrl}/api/images/artwork/upload?releaseId=${encodeURIComponent(releaseId)}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Upload failed' }));
    throw new Error(error.message ?? 'Failed to upload artwork');
  }

  const result = await response.json();

  // Invalidate cache
  revalidateTag(`releases:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  return {
    artworkUrl: result.artworkUrl,
    sizes: result.sizes,
  };
}

/**
 * Update the "allow artwork downloads" setting for a creator profile.
 * Stored in the profile's settings JSONB field.
 */
export async function updateAllowArtworkDownloads(
  allowDownloads: boolean
): Promise<void> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  try {
    const [currentProfile] = await db
      .select({ settings: creatorProfiles.settings })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id))
      .limit(1);

    const currentSettings = (currentProfile?.settings ?? {}) as Record<
      string,
      unknown
    >;

    await db
      .update(creatorProfiles)
      .set({
        settings: {
          ...currentSettings,
          allowArtworkDownloads: allowDownloads,
        },
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.id, profile.id));
  } catch (error) {
    throw new Error('Failed to update artwork download setting', {
      cause: error,
    });
  }

  // Skip revalidatePath — this setting lives on the creator profile, not on
  // releases. The component already does an optimistic update, and a path
  // revalidation here would reset client-side state (e.g. closing the sidebar).
}

/**
 * Revert release artwork to the original DSP-ingested artwork.
 * Restores artworkUrl and artworkSizes from the saved originals in metadata.
 */
export async function revertReleaseArtwork(
  releaseId: string
): Promise<{ artworkUrl: string; originalArtworkUrl: string }> {
  noStore();
  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  const release = await getReleaseById(releaseId);
  if (!release || release.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const metadata = (release.metadata as Record<string, unknown>) ?? {};
  const originalArtworkUrl = metadata.originalArtworkUrl as string | undefined;

  if (!originalArtworkUrl) {
    throw new Error('No original artwork to revert to');
  }

  const originalArtworkSizes = metadata.originalArtworkSizes as
    | Record<string, string>
    | undefined;

  await db
    .update(discogReleases)
    .set({
      artworkUrl: originalArtworkUrl,
      metadata: {
        ...metadata,
        artworkSizes: originalArtworkSizes ?? {},
      },
      updatedAt: new Date(),
    })
    .where(eq(discogReleases.id, releaseId));

  revalidateTag(`releases:${userId}:${profile.id}`, 'max');
  revalidatePath(APP_ROUTES.RELEASES);

  return { artworkUrl: originalArtworkUrl, originalArtworkUrl };
}
