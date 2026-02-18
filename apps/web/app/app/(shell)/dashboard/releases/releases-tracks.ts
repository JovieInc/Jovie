'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { getCachedAuth } from '@/lib/auth/cached';
import {
  getReleaseById,
  getTracksForReleaseWithProviders,
} from '@/lib/discography/queries';
import type { TrackViewModel } from '@/lib/discography/types';
import {
  buildProviderLabels,
  mapTrackToViewModel,
  requireProfile,
} from './releases-shared';

/**
 * Load tracks for a release (lazy loading for expandable rows)
 */
export async function loadTracksForRelease(params: {
  releaseId: string;
  releaseSlug: string;
}): Promise<TrackViewModel[]> {
  noStore();
  const { userId } = await getCachedAuth();

  if (!userId) {
    throw new TypeError('Unauthorized');
  }

  const profile = await requireProfile();

  // Verify the release belongs to the user's profile
  const release = await getReleaseById(params.releaseId);
  if (release?.creatorProfileId !== profile.id) {
    throw new TypeError('Release not found');
  }

  const providerLabels = buildProviderLabels();
  const { tracks } = await getTracksForReleaseWithProviders(params.releaseId);

  return tracks.map(track =>
    mapTrackToViewModel(
      track,
      providerLabels,
      profile.handle,
      params.releaseSlug
    )
  );
}
