'use server';

import { unstable_cache } from 'next/cache';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getDashboardDataEssential } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { APP_ROUTES } from '@/constants/routes';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';
import { getCachedAuth } from '@/lib/auth/cached';
import { CACHE_TTL } from '@/lib/cache/tags';
import { getWeeklyReleaseClickCounts } from '@/lib/db/queries/analytics';
import {
  getReleaseForProfileById,
  getReleasesForProfile as getReleasesFromDb,
} from '@/lib/discography/queries';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { buildProviderLabels } from '@/lib/discography/view-models';
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

async function fetchReleaseMatrixCore(
  profileId: string,
  profileHandle: string
): Promise<ReleaseViewModel[]> {
  const providerLabels = buildProviderLabels();
  const [releases, weeklyClickCounts] = await Promise.all([
    getReleasesFromDb(profileId, { includeDrafts: true }),
    // Weekly metric degrades gracefully: a failed aggregate never blocks the
    // releases list — rows just render the "—" placeholder.
    getWeeklyReleaseClickCounts(profileId).catch(
      () => new Map<string, number>()
    ),
  ]);

  return releases.map(release => {
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
  profileHandle: string,
  releaseId: string
): Promise<ReleaseViewModel | null> {
  const providerLabels = buildProviderLabels();
  const release = await getReleaseForProfileById(profileId, releaseId, {
    includeDrafts: true,
  });

  return release
    ? mapReleaseToViewModel(release, providerLabels, profileId, profileHandle)
    : null;
}

async function resolveReleaseMatrix(
  profileId?: string
): Promise<ReleaseViewModel[]> {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect(buildAppShellSignInUrl(APP_ROUTES.RELEASES));
  }

  const profile = await requireProfile(profileId);

  return unstable_cache(
    () => fetchReleaseMatrixCore(profile.id, profile.handle),
    ['releases-matrix', userId, profile.id],
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [`releases:${userId}:${profile.id}`],
    }
  )();
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

  return unstable_cache(
    () => fetchReleaseEntityCore(profile.id, profile.handle, params.releaseId),
    ['release-entity', userId, profile.id, params.releaseId],
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [`releases:${userId}:${profile.id}`],
    }
  )();
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
  const { userId } = await getCachedAuth();
  if (!userId || userId !== profile.userId) {
    throw new Error('Unauthorized');
  }

  return unstable_cache(
    () => fetchReleaseMatrixCore(profile.profileId, profile.profileHandle),
    [
      'releases-matrix',
      profile.userId,
      profile.profileId,
      profile.profileHandle,
    ],
    {
      revalidate: CACHE_TTL.MEDIUM,
      tags: [`releases:${profile.userId}:${profile.profileId}`],
    }
  )();
}
