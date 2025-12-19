'use server';

import { auth } from '@clerk/nextjs/server';
import { unstable_noStore as noStore, revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  PRIMARY_PROVIDER_KEYS,
  PROVIDER_CONFIG,
} from '@/lib/discography/config';
import {
  getReleasesForProfile,
  mapReleaseToViewModel,
  updateProviderLink,
} from '@/lib/discography/store';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { buildSmartLinkPath } from '@/lib/discography/utils';
import { getDashboardData } from '../actions';

function buildProviderLabels() {
  return Object.entries(PROVIDER_CONFIG).reduce(
    (acc, [key, value]) => {
      acc[key as ProviderKey] = value.label;
      return acc;
    },
    {} as Record<ProviderKey, string>
  );
}

async function requireProfile(): Promise<{ id: string }> {
  const data = await getDashboardData();

  if (data.needsOnboarding) {
    redirect('/onboarding');
  }

  if (!data.selectedProfile) {
    throw new Error('Missing creator profile');
  }

  return { id: data.selectedProfile.id };
}

export async function loadReleaseMatrix(): Promise<ReleaseViewModel[]> {
  noStore();
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const profile = await requireProfile();
  const providerLabels = buildProviderLabels();
  const releases = getReleasesForProfile(profile.id);

  return releases.map(release =>
    mapReleaseToViewModel(release, providerLabels, profile.id)
  );
}

export async function saveProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
  url: string;
}): Promise<ReleaseViewModel> {
  noStore();
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();
  if (profile.id !== params.profileId) {
    throw new Error('Profile mismatch');
  }

  const trimmedUrl = params.url.trim();
  if (!trimmedUrl) {
    throw new Error('URL is required');
  }

  const providerLabels = buildProviderLabels();
  const updated = updateProviderLink(
    params.profileId,
    params.releaseId,
    params.provider,
    trimmedUrl
  );

  revalidatePath('/app/dashboard/releases');
  return mapReleaseToViewModel(updated, providerLabels, profile.id);
}

export async function resetProviderOverride(params: {
  profileId: string;
  releaseId: string;
  provider: ProviderKey;
}): Promise<ReleaseViewModel> {
  noStore();
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthorized');
  }

  const profile = await requireProfile();
  if (profile.id !== params.profileId) {
    throw new Error('Profile mismatch');
  }

  const providerLabels = buildProviderLabels();
  const updated = updateProviderLink(
    params.profileId,
    params.releaseId,
    params.provider,
    ''
  );

  revalidatePath('/app/dashboard/releases');
  return mapReleaseToViewModel(updated, providerLabels, profile.id);
}

export const primaryProviderKeys = PRIMARY_PROVIDER_KEYS;
export const providerConfig = PROVIDER_CONFIG;
export const buildSmartPath = buildSmartLinkPath;
