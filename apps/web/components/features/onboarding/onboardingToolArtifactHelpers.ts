import type { SpotifyArtistResult } from '@/lib/contracts/api';
import {
  getDisplaySpotifyFollowers,
  normalizeArtistMetrics,
} from '@/lib/onboarding/canonical-metrics';
import type { OnboardingArtistSelection } from './onboardingToolArtifactTypes';

export function selectionFromSpotifyResult(
  artist: SpotifyArtistResult
): OnboardingArtistSelection {
  const metrics = normalizeArtistMetrics(
    { followers: artist.followers },
    { source: 'spotify_search' }
  );
  return {
    id: artist.id,
    name: artist.name,
    url: artist.url,
    imageUrl: artist.imageUrl ?? undefined,
    followers: getDisplaySpotifyFollowers(metrics) ?? undefined,
    metrics,
    popularity: artist.popularity ?? undefined,
  };
}

export function getArtistSearchFailureCopy(error: string | null): {
  title: string;
  body: string;
} {
  const normalizedError = error?.toLowerCase() ?? '';

  if (normalizedError.includes('too many')) {
    return {
      title: 'Too many Spotify searches',
      body: 'Give it a moment, then try again.',
    };
  }

  if (
    normalizedError.includes('unavailable') ||
    normalizedError.includes('temporary') ||
    normalizedError.includes('server')
  ) {
    return {
      title: 'Spotify search is having trouble',
      body: 'Try again, or paste the Spotify artist link in chat.',
    };
  }

  return {
    title: 'Spotify search did not finish',
    body: 'Check the artist name and try again.',
  };
}
