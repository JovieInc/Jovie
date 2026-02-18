'use server';

import {
  unstable_noStore as noStore,
  revalidatePath,
  revalidateTag,
  unstable_cache,
} from 'next/cache';
import { redirect } from 'next/navigation';
import { APP_ROUTES } from '@/constants/routes';
import { getCachedAuth } from '@/lib/auth/cached';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import { validateProviderUrl } from '@/lib/discography/provider-domains';
import {
  getProviderLink,
  getReleaseById,
  getReleasesForProfile as getReleasesFromDb,
  resetProviderLink as resetProviderLinkDb,
  upsertProviderLink,
} from '@/lib/discography/queries';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import {
  buildProviderLabels,
  mapReleaseToViewModel,
  requireProfile,
} from './releases-shared';

/**
 * Core release matrix fetch logic (cacheable)
 */
async function fetchReleaseMatrixCore(
  profileId: string,
  profileHandle: string
): Promise<ReleaseViewModel[]> {
  const providerLabels = buildProviderLabels();
  const releases = await getReleasesFromDb(profileId);

  return releases.map(release =>
    mapReleaseToViewModel(release, providerLabels, profileId, profileHandle)
  );
}

/**
 * Load release matrix with caching (30s TTL)
 * Cache is invalidated on mutations (save/reset provider links, Spotify sync)
 */
export async function loadReleaseMatrix(
  profileId?: string
): Promise<ReleaseViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(`/sign-in?redirect_url=${APP_ROUTES.RELEASES}`);
  }

  const profile = await requireProfile(profileId);

  // Cache with 30s TTL and tags for invalidation
  return unstable_cache(
    () => fetchReleaseMatrixCore(profile.id, profile.handle),
    ['releases-matrix', userId, profile.id],
    {
      revalidate: 30,
      tags: [`releases:${userId}:${profile.id}`],
    }
  )();
}

export async function saveProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
  url: string;
}): Promise<ReleaseViewModel> {
  noStore();

  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      throw new TypeError('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new TypeError('Profile mismatch');
    }

    const trimmedUrl = params.url?.trim() ?? '';
    if (!trimmedUrl) {
      throw new TypeError('URL is required');
    }

    // Validate URL format and provider domain
    const providerLabel = PROVIDER_CONFIG[params.provider]?.label;
    const validation = validateProviderUrl(
      trimmedUrl,
      params.provider,
      providerLabel
    );
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new TypeError('Invalid provider');
    }

    // Save the provider link override
    await upsertProviderLink({
      releaseId: params.releaseId,
      providerId: params.provider,
      url: trimmedUrl,
      sourceType: 'manual',
    });

    // Fetch the updated release
    const release = await getReleaseById(params.releaseId);
    if (!release) {
      throw new TypeError('Release not found');
    }

    const providerLabels = buildProviderLabels();

    // Invalidate cache and revalidate path
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');
    revalidatePath(APP_ROUTES.RELEASES);

    return mapReleaseToViewModel(
      release,
      providerLabels,
      profile.id,
      profile.handle
    );
  } catch (error) {
    // Re-throw with user-friendly message
    const message =
      error instanceof Error ? error.message : 'Failed to save provider link';
    throw new Error(message);
  }
}

export async function resetProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
}): Promise<ReleaseViewModel> {
  noStore();

  try {
    const { userId } = await getCachedAuth();
    if (!userId) {
      throw new TypeError('Unauthorized');
    }

    const profile = await requireProfile();
    if (profile.id !== params.profileId) {
      throw new TypeError('Profile mismatch');
    }

    // Validate provider key
    if (!PROVIDER_CONFIG[params.provider]) {
      throw new TypeError('Invalid provider');
    }

    // Get the current provider link to check for ingested URL
    const existingLink = await getProviderLink(
      params.releaseId,
      params.provider
    );

    // Get the ingested URL from metadata if available
    const ingestedUrl =
      existingLink?.sourceType === 'ingested' ? existingLink.url : undefined;

    // Reset the provider link
    await resetProviderLinkDb(params.releaseId, params.provider, ingestedUrl);

    // Fetch the updated release
    const release = await getReleaseById(params.releaseId);
    if (!release) {
      throw new TypeError('Release not found');
    }

    const providerLabels = buildProviderLabels();

    // Invalidate cache and revalidate path
    revalidateTag(`releases:${userId}:${profile.id}`, 'max');
    revalidatePath(APP_ROUTES.RELEASES);

    return mapReleaseToViewModel(
      release,
      providerLabels,
      profile.id,
      profile.handle
    );
  } catch (error) {
    // Re-throw with user-friendly message
    const message =
      error instanceof Error ? error.message : 'Failed to reset provider link';
    throw new Error(message);
  }
}

/**
 * Refresh a single release from the database.
 * Re-fetches the release data (including provider links) without hitting Spotify API.
 */
export async function refreshRelease(params: {
  releaseId: string;
}): Promise<ReleaseViewModel> {
  noStore();

  const { userId } = await getCachedAuth();
  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const providerLabels = buildProviderLabels();

  return mapReleaseToViewModel(
    release,
    providerLabels,
    profile.id,
    profile.handle
  );
}
