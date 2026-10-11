'use server';

import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDashboardDataEssential } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { getCachedAuth } from '@/lib/auth/cached';
import { CACHE_TTL, createReleasesTag } from '@/lib/cache/tags';
import { getWeeklyReleaseClickCounts } from '@/lib/db/queries/analytics';
import type { ReleaseWithProviders } from '@/lib/discography/queries';
import {
  getReleaseForProfileById,
  getReleasesForProfile as getReleasesFromDb,
} from '@/lib/discography/queries';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { buildProviderLabels } from '@/lib/discography/view-models';
import { requireOwnedReleaseProfile } from './owned-profile';
import type { ReleaseProfileContext } from './release-types';
import { mapReleaseToViewModel } from './release-view-models';

async function requireProfile(profileId?: string): Promise<{
  id: string;
  spotifyId: string | null;
  handle: string;
}> {
  const data = await getDashboardDataEssential();

  if (data.needsOnboarding && !data.dashboardLoadError) {
    redirect(APP_ROUTES.START);
  }

  let profile = data.selectedProfile;

  if (profileId) {
    profile = data.creatorProfiles.find(p => p.id === profileId) ?? null;
  }

  if (!profile) {
    redirect(APP_ROUTES.START);
  }

  return {
    id: profile.id,
    spotifyId: profile.spotifyId ?? null,
    handle: profile.usernameNormalized ?? profile.username,
  };
}

/**
 * Release matrix/entity server-cache key family (JOV-6272).
 *
 * Keyed by (userId, profileId, scope) only. The profile handle NEVER
 * participates in the key: the same logical data must share one cache entry
 * across handle renames, and mutations invalidate the family by
 * (userId, profileId) regardless of handle changes.
 */
function releaseCacheKeys(userId: string, profileId: string) {
  return {
    matrix: ['releases-matrix', userId, profileId],
    matrixArchived: ['releases-matrix-archived', userId, profileId],
    entity: (releaseId: string) => [
      'release-entity',
      userId,
      profileId,
      releaseId,
    ],
  };
}

interface CachedReleaseMatrix {
  readonly releases: ReleaseWithProviders[];
  readonly weeklyClickCounts: Array<[string, number]>;
}

async function fetchReleaseMatrixCore(
  profileId: string,
  lifecycle: 'active' | 'archived' = 'active'
): Promise<CachedReleaseMatrix> {
  const [releases, weeklyClickCounts] = await Promise.all([
    getReleasesFromDb(profileId, { includeDrafts: true, lifecycle }),
    // Weekly metric degrades gracefully: a failed aggregate never blocks the
    // releases list — rows just render the "—" placeholder.
    getWeeklyReleaseClickCounts(profileId).catch(
      () => new Map<string, number>()
    ),
  ]);

  return {
    releases,
    weeklyClickCounts: Array.from(weeklyClickCounts.entries()),
  };
}

function mapReleaseMatrix(
  cached: CachedReleaseMatrix,
  profileId: string,
  profileHandle: string
): ReleaseViewModel[] {
  const providerLabels = buildProviderLabels();
  const weeklyClickCounts = new Map(cached.weeklyClickCounts);

  return cached.releases.map(release => {
    const viewModel = mapReleaseToViewModel(
      release,
      providerLabels,
      profileId,
      profileHandle
    );
    viewModel.weeklyStreams = weeklyClickCounts.get(viewModel.id) ?? null;
    return viewModel;
  });
}

async function fetchReleaseEntityCore(
  profileId: string,
  releaseId: string
): Promise<ReleaseWithProviders | null> {
  return getReleaseForProfileById(profileId, releaseId, {
    includeDrafts: true,
  });
}

async function resolveReleaseMatrix(
  profileId?: string
): Promise<ReleaseViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.RELEASES));
  }

  const profile = await requireProfile(profileId);

  const cached = await unstable_cache(
    () => fetchReleaseMatrixCore(profile.id),
    releaseCacheKeys(userId, profile.id).matrix,
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [createReleasesTag(userId, profile.id)],
    }
  )();

  return mapReleaseMatrix(cached, profile.id, profile.handle);
}

const loadReleaseMatrixCached = cache(resolveReleaseMatrix);

export async function loadReleaseMatrix(
  profileId?: string
): Promise<ReleaseViewModel[]> {
  return loadReleaseMatrixCached(profileId);
}

async function resolveReleaseEntity(params: {
  readonly profileId: string;
  readonly releaseId: string;
}): Promise<ReleaseViewModel | null> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.RELEASES));
  }

  const profile = await requireProfile(params.profileId);

  const release = await unstable_cache(
    () => fetchReleaseEntityCore(profile.id, params.releaseId),
    releaseCacheKeys(userId, profile.id).entity(params.releaseId),
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [createReleasesTag(userId, profile.id)],
    }
  )();

  return release
    ? mapReleaseToViewModel(
        release,
        buildProviderLabels(),
        profile.id,
        profile.handle
      )
    : null;
}

const loadReleaseEntityCached = cache(resolveReleaseEntity);

export async function loadReleaseEntity(params: {
  readonly profileId: string;
  readonly releaseId: string;
}): Promise<ReleaseViewModel | null> {
  return loadReleaseEntityCached(params);
}

export async function loadReleaseMatrixForProfile(
  profile: ReleaseProfileContext
): Promise<ReleaseViewModel[]> {
  const owned = await requireOwnedReleaseProfile(profile.profileId);

  const cached = await unstable_cache(
    () => fetchReleaseMatrixCore(owned.profileId),
    releaseCacheKeys(owned.userId, owned.profileId).matrix,
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [createReleasesTag(owned.userId, owned.profileId)],
    }
  )();

  return mapReleaseMatrix(cached, owned.profileId, owned.profileHandle);
}

export async function loadArchivedReleaseMatrixForProfile(
  profile: ReleaseProfileContext
): Promise<ReleaseViewModel[]> {
  const owned = await requireOwnedReleaseProfile(profile.profileId);

  const cached = await unstable_cache(
    () => fetchReleaseMatrixCore(owned.profileId, 'archived'),
    releaseCacheKeys(owned.userId, owned.profileId).matrixArchived,
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [createReleasesTag(owned.userId, owned.profileId)],
    }
  )();

  return mapReleaseMatrix(cached, owned.profileId, owned.profileHandle);
}
